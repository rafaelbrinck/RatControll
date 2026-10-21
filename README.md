# RatControll

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.2.

## Supabase environment

Create a local `.env` from `.env.example` and set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. The `.env` file is ignored by Git.

The `npm start`, `npm run build`, `npm run watch`, and `npm test` scripts generate a temporary Supabase configuration before running. On Vercel, add the same variables under **Project Settings > Environment Variables** and use `npm run build` as the build command.

The publishable key is included in the browser bundle by design. Never use a Supabase `service_role` or `sb_secret` key in this Angular application; configure Row Level Security policies for all exposed tables.

## Ponto de venda

The authenticated `/vendas` route reads the current user's `Estoque` items through the existing stock service. Sale confirmation is sent only through the existing `public.finalizar_venda(p_itens JSONB, p_desconto_total NUMERIC, p_cliente_id BIGINT)` RPC; each item includes `estoque_id`, `quantidade`, `valor_unitario`, and `desconto_unitario`, matching the deployed function's validation. The browser does not write sale items, stock changes, or stock movements directly. Ensure the function validates the supplied unit price against the owned stock row before using it in calculations; validate an optional active client and take customer snapshots from the database.

The client module expects `public."Clientes"` with the documented contact, owner, status, and timestamp columns and RLS restricting access to authorized owners. It supports active/inactive filtering, paginated searches, editing, reactivation, soft deactivation, and per-client purchase history. Inactive clients remain visible on their detail page, but are excluded from new-sale searches and are revalidated before sale submission. The sales history and details expect `Vendas.cliente_id`, `Vendas.cliente_nome`, `Vendas.cliente_documento`, and the documented `Itens_Venda` columns. The sale detail view displays the stored snapshot and links to the current client record separately. No cancellation operation is exposed because the application has no verified transactional cancellation RPC.

The Supabase database migration remains a deployment prerequisite; no backend/database connection was available to verify or change its schema. Create the `Clientes` table and owner-scoped RLS policies; add nullable `cliente_id` (foreign key), `cliente_nome`, and `cliente_documento` columns to `Vendas`; preserve existing rows with null client snapshots; and deploy the updated transactional function. That function must validate `p_cliente_id` against the authenticated user's context and active status, fetch the name/document itself for the sale snapshots, and preserve the current stock locks, calculations, and movement inserts. Grant execution only to `authenticated`, revoke public/anon access, and remove/revoke the old `finalizar_venda(JSONB, NUMERIC)` overload once the replacement and all clients are verified, so it cannot bypass client validation. Do not assume a document uniqueness constraint: add one only if the business rule and existing data support it. Verify the new function, columns, grants, and RLS policies in Supabase before deployment. The function signature has no idempotency key: after a connection loss the UI preserves the in-memory cart, stores only a pending-attempt marker for the browser tab, blocks automatic retries, and requires the operator to check the history before explicitly clearing the marker or allowing another attempt. A reload will not restore the cart, but the marker continues to block another sale until the operator checks the history.

## Development server

To start a local development server, run:

```bash
npm start
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
npm run build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
npm test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
