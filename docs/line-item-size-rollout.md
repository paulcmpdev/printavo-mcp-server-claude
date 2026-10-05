# Line item size-null rollout evidence

Before enabling this mutation in a live environment, record evidence for each item:

- Confirm the advertised MCP schema keeps update counts nullable, create counts non-nullable, and caps both numeric and numeric-string counts at `2147483647`.
- Run the full unit test, typecheck, and build suites from the exact release revision.
- In a controlled test order, capture the pre-update size state.
- Send one update containing a null clear request, a literal zero, and one omitted existing size.
- Re-read the same order and record whether Printavo persisted the null clear and whether the omitted size was retained, cleared, or otherwise changed.
- Compare returned totals with the persisted size state before describing the endpoint as merge or replace behavior.
- Keep request/response evidence free of credentials and customer data.

Until that controlled test is complete, documentation should state only what this
server sends; it must not promise upstream clear or merge persistence.

## Reconciliation-required outcomes

Record `isError: true` with `status: reconciliation_required` as an unverified mutation outcome, not proof that nothing changed. Preserve target ID and requested/observed evidence; independently re-read the exact order before considering any retry. If the upstream response omits a requested cleared slot instead of returning an explicit null, this implementation deliberately requires reconciliation. Do not weaken that guard based solely on a successful HTTP response.

## Review scope and separate follow-up

Size-update null/zero display and requested/returned reconciliation are covered by regression tests. Live persistence remains unverified. The general add-line-item and non-size update handlers retain separate response-shape/identity validation weaknesses; create Markdown also hides zeros. Those are recorded follow-up defects, not repaired by this size-update change. Do not describe this patch as validating every Printavo mutation tool.

## Create empty-map behavior

For `printavo_add_line_item`, an explicitly supplied `sizes: {}` is serialized as
`sizes: []`. This is documented transport behavior, not evidence of what Printavo
will persist. Omit `sizes` when no size instruction is intended.
