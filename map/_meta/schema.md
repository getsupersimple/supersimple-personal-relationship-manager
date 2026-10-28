# Card schema

Closed node types: `object`, `process`.

Frontmatter (all cards):

```yaml
type: object | process
name: <product name>
code_name: <type/file name if different>
universe: live | leftover | ghost
cluster: storage | identity | platforms | ai | surfaces | build | processes
status: stub | verified | stale
verified_on: YYYY-MM-DD      # required if verified
verified_at: <git short sha or release tag> # required if verified
owner_files: [path, ...]
```

Object card sections, in order: one-sentence definition · Why this shape · Shape (cited) · Connected to ·
If you change this (**Hits** / **Does not hit**) · Surfaces · See.

Process card: Input → Movement → Output, numbered steps with citations, `consumes` / `produces` as links to
object cards, Hits / Does not hit.

Hits / Does not hit is first-order only. "Does not hit" names the obvious neighbour that is the wrong one.
