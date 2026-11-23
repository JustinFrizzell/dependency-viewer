# Table colours

Type: prototype
Status: resolved

Implement six fixed-colour rules for matching table names. Apply the first
case-insensitive substring match to the full name; ignore blank rules.
Default to bronze, silver, and gold with three empty rules. Provide live
editing, an on/off switch, reset, and up/down reordering that moves each
colour and its text together. Changes last until reload. Preserve existing
status and selection borders.

## Prototype decision

Selected variant A, the collapsible side panel, named "Colours". The user
subsequently requested reordering by priority. Prototype source:
`prototype/table-colours` at `2777cb53eff919ca172c673b8013a1c2a0f36d7e`.
