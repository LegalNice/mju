# Local configuration boundary

`config/local/` is intentionally ignored by Git. It is reserved for
machine-specific LegalNice or agent-runtime state, including audit logs,
local paths, and other data that must not be part of a public repository.

Reusable configuration belongs in source-controlled files outside this
directory. Before publishing, review the staged file list rather than adding
an entire working directory.
