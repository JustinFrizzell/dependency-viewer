# Define the lineage data contract

Type: grilling
Status: resolved

## Question

What exact JSON contract and graph semantics should the MVP support? Starting with `tables`, `name`, `description`, and `inputs`, decide table identity and matching, optional fields, missing input records, duplicate tables or edges, invalid data, and cycles. Use concrete examples and specify what happens for each case.

## Answer

The JSON root is an object containing a required `tables` array. The array may be empty; the viewer then shows an empty state.

```json
{
  "tables": [
    {
      "name": "workspace.lakehouse.schema.orders",
      "description": "Cleaned orders",
      "inputs": ["workspace.lakehouse.schema.raw_orders"]
    }
  ]
}
```

- Every record requires a `name` string and an `inputs` array of strings. `description` is an optional string and may be empty. An explicit empty `inputs` array means no known inputs.
- Names are opaque, exact, and case-sensitive. They must not be blank or have leading or trailing whitespace; internal spaces are allowed. Four-part names are supported but not required.
- Duplicate table records with the same name are errors. Repeating an input within a record produces only one relationship.
- Each input is an upstream table, with a directed relationship from the input to the table listing it. An input without its own record appears as an undocumented placeholder whose inputs are unknown.
- Cycles, including self-dependencies, are errors.
- Malformed JSON, missing required fields, `null` for contract fields, and wrong field types fail generation with a useful error. Extra fields are ignored.
