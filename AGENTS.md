# Agent guide

Keep Commerce separate from Kujo SSG. Provider and cart concepts belong here;
the SSG remains purely static. Run `npm run validate` before publishing. Never
commit provider credentials or emit them into generated files. Public contracts
are versioned and changes require tests and CHANGELOG updates.
