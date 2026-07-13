import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Copy, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useDiagnosticChats, useSendDiagnosticMessage } from "@/hooks/use-diagnostic-chat";
import { useCurrentUser } from "@/hooks/use-current-user";
import { renderMarkdownLite } from "@/lib/markdown-lite";
import { cn } from "@/lib/utils";

type Props = {
  repairId: string;
  onCopyToLog: (text: string) => void;
};

export function DiagnosticChatCard({ repairId, onCopyToLog }: Props) {
  const { hasAny } = useCurrentUser();
  const canUse = hasAny(["Admin", "Technician"]);

  const [open, setOpen] = useState(true);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  // Synchronous guard alongside send.isPending — mutate() flips isPending via a
  // React state update, which lands a render (and thus the disabled button) one
  // tick late. A fast enough double-click/double-Enter can slip both requests
  // through before that render happens; this ref closes that race immediately.
  const sendingRef = useRef(false);

  const { data: chats, isLoading } = useDiagnosticChats(canUse ? repairId : undefined);
  const send = useSendDiagnosticMessage();

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chats, send.isPending]);

  if (!canUse) return null;

  function handleSend() {
    const message = input.trim();
    if (!message || sendingRef.current || send.isPending) return;
    sendingRef.current = true;
    send.mutate(
      { repairId, message },
      {
        onSuccess: () => {
          sendingRef.current = false;
          setInput("");
        },
        onError: (e) => {
          sendingRef.current = false;
          toast.error(e.message);
        },
      },
    );
  }

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="space-y-0">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex w-full items-center gap-2 text-left">
              <Sparkles className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Diagnostic Assistant</CardTitle>
              <ChevronDown className={cn("ml-auto h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-3">
            <div ref={scrollRef} className="max-h-96 space-y-3 overflow-y-auto rounded-md border border-border bg-muted/20 p-3">
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : !chats || chats.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ask a question to start the diagnosis (e.g. "the printer is printing blank pages").
                </p>
              ) : (
                chats.map((c) => (
                  <div key={c.id} className={cn("flex", c.role === "user" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                        c.role === "user" ? "bg-primary text-primary-foreground" : "border border-border bg-card",
                      )}
                    >
                      {c.role === "assistant" ? (
                        <>
                          <div className="space-y-2">{renderMarkdownLite(c.message)}</div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="mt-2 h-7 px-2 text-xs"
                            onClick={() => onCopyToLog(c.message)}
                          >
                            <Copy className="mr-1 h-3 w-3" />Copy to log
                          </Button>
                        </>
                      ) : (
                        <p className="whitespace-pre-wrap">{c.message}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
              {send.isPending && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
                    The assistant is thinking…
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Textarea
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Describe the symptom or ask a question…"
                disabled={send.isPending}
              />
              <Button size="icon" onClick={handleSend} disabled={!input.trim() || send.isPending} aria-label="Send">
                <Send className="h-4 w-4" />
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              AI assistant for guidance only — the official diagnosis is the technician's, to be recorded in the repair log.
            </p>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
