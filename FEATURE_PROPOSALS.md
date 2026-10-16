# Proposed mAI Spot improvements

These are proposals, separate from the implemented messaging and call fixes. Effort is relative: small, medium or large; it is not a delivery estimate.

## First priorities

| Priority | Proposal | User benefit and scope | Effort |
| --- | --- | --- | --- |
| 1 | Connection and device check | A **Test my setup** screen checks the local server, friend connection, microphone level, camera preview and browser permissions. Provide a copyable report of failed checks and call stages. | Medium |
| 2 | Local call history and diagnostics | Show incoming, outgoing, missed and failed calls, with one-click redial. Save a bounded local error history so an error remains available after the call window closes. Diagnostic export excludes message text, media, identity secrets, SDP and network addresses by default. | Medium |
| 3 | Device selection | Choose microphone and camera, preview before dialing, and switch during a call. Add a speaker picker where the browser supports it, with a clear fallback otherwise. | Medium |
| 4 | Chat search and saved drafts | Search message text by friend/date, jump to a result, and preserve separate drafts for each conversation across minimization and refresh. | Medium |
| 5 | Better notification controls | Per-chat mute, quiet hours, unread filters and optional browser notifications for messages and missed calls. Request browser notification permission only when the user enables it. | Small–medium |

## More communication features

| Proposal | Scope and tradeoffs | Effort |
| --- | --- | --- |
| Screen sharing | Share a window or screen during a call, with an obvious stop button. Restore the camera after sharing ends; continue voice when screen capture is declined. | Medium |
| Pictures and file attachments | Explicit file selection, progress, cancel/retry, size limits and disk quotas. Show file type and size before accepting; reuse friend authentication and do not auto-open received files. | Large |
| Direct LAN connection fallback | Let paired Spots connect on the local network when public discovery is unavailable. Preserve key authentication and invite rules; keep owner APIs restricted to localhost. This requires changes to peer discovery and transport, not opening the existing private UI to LAN clients. | Large |
| Optional relay support | Allow an administrator to configure a TURN service for calls on restrictive networks. Make it opt-in, explain the additional bandwidth and media path, and continue supporting direct calls without a relay. | Medium–large |
| Group conversation tools | Rename groups, mention members, reply to individual messages, mute groups and show unread mentions separately. Define who may add/remove members and how offline changes reconcile. | Medium–large |

## Improvements across the Spot

| Proposal | Scope and user benefit | Effort |
| --- | --- | --- |
| Watch-party queue and host controls | Queue episodes, choose host-only or shared playback controls, and provide an explicit resync button and connection indicator. | Medium |
| Encrypted backup and restore | Back up profile, friend permissions, messages and identity with a password-protected archive. Show a restore preview and handle identity replacement explicitly. Media can be an optional separate archive. | Large |
| Media playback checks | Explain unsupported containers/codecs before joining a party or starting playback. Optionally support a separately installed local conversion tool, with progress and space estimates. | Medium–large |
| Broadcast scheduling | Schedule station start/stop times and repeat days, with timezone-aware previews. Explain that the Spot must remain running and handle missed schedules after restart. | Medium |

Suggested order: setup checks and saved diagnostics, then device selection and chat search. Those improvements make future failures easier to diagnose and improve everyday communication before expanding transport and media features.
