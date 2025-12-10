# Troubleshooting Log

This document summarizes the troubleshooting steps taken to resolve an issue with the IDE preview and external URL after importing the project from `loveable.dev`.

**Initial Problem:**
The issue began after importing the project from `loveable.dev` and attempting to update the favicon. This resulted in an error in the `.idx/dev.nix` file, which prevented the IDE's preview from building. The application was showing a "502 Bad Gateway" error.

**Troubleshooting Steps:**

1.  **Correcting `.idx/dev.nix`:** The `idx.previews` attribute in `.idx/dev.nix` was identified as having an incorrect structure and was corrected.

2.  **Investigating Favicon:** The `?v=2` query string was removed from the favicon links in `index.html`.

3.  **Updating Supabase Config:** The `site_url` and `additional_redirect_urls` in `supabase/config.toml` were updated to the correct public-facing URL.

4.  **Diagnosing Server Start Failure:** The `npm install && npx vite` command was hanging.
    *   `npm install` was run separately and completed successfully, ruling out a dependency installation issue.
    *   `npx vite --host 0.0.0.0 --port 5173 --debug` was run to get detailed server logs.

5.  **Identifying Port Conflict:** The debug logs revealed the root cause:
    *   The Vite server was attempting to start on port `5173` but found it was already in use.
    *   The server then automatically selected the next available port, `5174`.
    *   The IDE preview, however, was still configured to connect to `5173`, resulting in the "502 Bad Gateway" error.
    *   Attempts to identify and terminate the process blocking port `5173` with `lsof` and `ss` were unsuccessful, suggesting an unusual environment state.

***

### Continued Troubleshooting: The Mystery of Port 9000

**Next Problem:**
Even after successfully reconfiguring the application to run on a free port (`9001`), the IDE's preview browser continued to make requests to a hardcoded port `9000`, resulting in persistent "502 Bad Gateway" errors.

**Troubleshooting Steps:**

1.  **Configuration Alignment:** All relevant configuration files (`vite.config.ts`, `.idx/dev.nix`, and `supabase/config.toml`) were updated to use a consistent port (`9001`). The server was confirmed to be running correctly on this new port.

2.  **Browser Log Analysis:** Browser console logs repeatedly confirmed that the preview window was ignoring all configuration and attempting to connect to `https://9000-...`, proving the issue was with the preview environment itself.

3.  **Searching for Overrides:** The environment was searched for other configuration sources, such as `.vscode/settings.json`, that might be forcing the preview to use port `9000`, but none were found.

4.  **Attempting to Reclaim Port 9000:** The strategy shifted to identifying and terminating the process blocking port `9000`.
    *   `netstat -tulnp` revealed a process was `LISTEN`ing on port `9000`.
    *   Crucially, the command could not identify the Process ID (PID), indicating it was a privileged process running as another user (likely `root`).
    *   An attempt to use `sudo` to gain the necessary permissions failed, as passwordless `sudo` was not enabled.
    *   A final, exhaustive review of all running processes with `ps aux` did not reveal any identifiable culprit.

***

### Phase 3: Holistic Environment Audit & Standardization (Current Status)

**Diagnosis:**
The project suffered from a "civil war" of configurations.
*   `vite.config.ts` was hardcoded to `port: 9001`.
*   `package.json` forced `vite --port 9000`.
*   `.idx/dev.nix` **missing the `idx.previews` block entirely**, meaning the IDE had no instruction on how to run the app and likely defaulted to a broken state or conflicted with the other configs.
*   Port 9000 was confirmed to be blocked by a privileged process (likely a zombie service).

**Action Taken:**
We have moved the entire project to **Port 3000** to avoid the 9000/9001/5173 conflict zones.

1.  **`vite.config.ts`**: Updated `server.port` to `3000`.
2.  **`package.json`**: Updated `dev` script to `vite --port 3000 --host`.
3.  **`.idx/dev.nix`**: Added the missing `idx.previews` block to explicitly command the IDE to run `npm run dev` and listen on `$PORT` (which will map to 3000).
4.  **`supabase/config.toml`**: Updated redirect URLs to use `3000-` prefix instead of `9000-`.

**Immediate Next Step:**
The user is **Rebuilding the Environment**. This is required to load the new `.idx/dev.nix` configuration.

---

### ⚠️ INSTRUCTIONS FOR THE NEXT AGENT (If Rebuild Fails)

If the user returns after the rebuild and the app is still broken, **DO NOT start changing ports randomly.** Follow this logic:

**Scenario 1: Still "502 Bad Gateway"**
*   **Check:** Open the terminal and run `curl -v http://localhost:3000`.
    *   *If connection refused:* The server isn't running. Run `npm run dev` manually in the terminal and see why it fails.
    *   *If successful (200 OK):* The server is fine, but the IDE Preview is looking at the wrong place. Check `.idx/dev.nix` again.
*   **Check:** Verify `vite.config.ts` hasn't been reverted.

**Scenario 2: "Port 3000 is already in use"**
*   If Port 3000 is *also* blocked (unlikely), pick a random high port (e.g., `3005`) and update ALL FOUR files again:
    1.  `vite.config.ts`
    2.  `package.json`
    3.  `.idx/dev.nix`
    4.  `supabase/config.toml`

**Scenario 3: App Loads, but "Auth Configuration Missing" or Login Fails**
*   This is expected because we changed the port, so the Redirect URL in Supabase is wrong.
*   **Fix:**
    1.  Look at the browser URL bar in the preview (e.g., `https://3000-project-id.cluster.dev`).
    2.  Copy that **exact base URL**.
    3.  Update `supabase/config.toml`: `site_url` and `additional_redirect_urls` with this new URL.
    4.  (If using local Supabase) You might need to restart Supabase: `npx supabase stop && npx supabase start`.

**Goal:** Keep the configuration **holistic**. Do not change one file without changing the others.
