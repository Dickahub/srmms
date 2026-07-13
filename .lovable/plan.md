# Phase 2 — Clients & Machines

Build the customer + equipment registry that repairs will attach to in Phase 3.

## Scope

- **Clients**: companies or individuals who own machines
- **Machines**: physical equipment owned by a client (serial number, model, brand, type, notes)
- One client → many machines
- Access: Admin + Receptionist can create/edit/delete; Technicians can view

## Database (one migration)

**`clients`** — `name`, `contact_person`, `email`, `phone`, `address`, `tax_id`, `notes`, `created_by`
- RLS: authenticated can view; Admin + Receptionist can insert/update/delete
- Trigger for `updated_at`

**`machines`** — `client_id (FK → clients, cascade)`, `brand`, `model`, `serial_number (unique)`, `machine_type`, `year`, `notes`, `created_by`
- Same RLS pattern
- Index on `client_id` and `serial_number`

## UI (routes under `_authenticated/`)

```text
/clients                  List + search + "New client" button
/clients/new              Create client form
/clients/$clientId        Client detail: info + machines table + "Add machine" button
/clients/$clientId/edit   Edit client form
/machines/$machineId      Machine detail
/machines/$machineId/edit Edit machine form
```

- List view: search by name/email/phone, paginated table
- Client detail: shows all machines with quick "view" links; inline add-machine dialog
- Role-gated action buttons (hidden for Technicians)

## Data layer

- TanStack Query hooks: `useClients`, `useClient(id)`, `useClientMachines(id)`, `useMachine(id)`
- Mutations: `useCreateClient`, `useUpdateClient`, `useDeleteClient`, `useCreate/Update/DeleteMachine`
- All calls via `supabase` browser client (RLS enforces access)
- On success: toast + `queryClient.invalidateQueries`

## Files

- `supabase/migrations/…_clients_machines.sql`
- `src/hooks/use-clients.ts`, `src/hooks/use-machines.ts`
- `src/routes/_authenticated/clients.index.tsx`
- `src/routes/_authenticated/clients.new.tsx`
- `src/routes/_authenticated/clients.$clientId.tsx`
- `src/routes/_authenticated/clients.$clientId.edit.tsx`
- `src/routes/_authenticated/machines.$machineId.tsx`
- `src/routes/_authenticated/machines.$machineId.edit.tsx`
- `src/components/clients/ClientForm.tsx`
- `src/components/clients/MachineForm.tsx`

## Out of scope (later phases)

- Repair orders (Phase 3)
- Inventory / parts (Phase 4)
- Notifications, audit log (Phase 5+)
