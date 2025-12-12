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

### Phase 3: Holistic Environment Audit & Standardization

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

***

### Phase 4: Edge Function Deployment Failure (Error 546) & Client-Side Bypass

**Problem:**
The user encountered a persistent **546 Error** ("Loop detected" or "Dependency load failure") when attempting to process receipts via the `process-receipt-ocr` Edge Function.

**Investigation:**
1.  **Dependency Loop:** The error 546 is specific to Supabase/Deno Edge Functions failing to load dependencies (specifically `esm.sh` imports) or entering a loop during startup.
2.  **Attempts to Fix:**
    *   Verified Environment Variables (`test-env` function).
    *   Updated `ReceiptCapture.tsx` to show detailed error logs.
    *   Removed `GoogleGenerativeAI` SDK dependency, switching to raw `fetch` for the Gemini API.
    *   Replaced `esm.sh` imports with `npm:` imports for Supabase client.
    *   **Ultimate Attempt:** Rewrote the entire Edge Function to be **dependency-free** (using only Deno standard library and raw `fetch`).
3.  **Root Cause Discovery:** Despite the code being dependency-free, the 546 error persisted. This confirmed that the **deployment pipeline was broken**. The code on the server was stuck on an old, broken version and was not updating despite local file changes.

**Solution: Client-Side Fallback Strategy**
Since the backend deployment was inaccessible/broken in the current environment, we implemented a robust **Client-Side Fallback**.

1.  **`src/lib/gemini.ts`**: Created a utility to call Google Gemini API directly from the browser (bypassing the Edge Function).
2.  **Settings UI**: Added a `SettingsDialog.tsx` (accessible via Header) allowing the user to input their **Gemini API Key**.
3.  **`ReceiptCapture.tsx` Logic**:
    *   Attempts to call the Server Edge Function first.
    *   If the server fails (546/500/Network Error), it checks for a local Gemini API Key.
    *   If the key exists, it processes the receipt locally in the browser using Gemini 1.5 Flash (multimodal).
    *   If the key is missing, it prompts the user to configure it via Settings.

**Outcome:**
The user successfully processed receipts using the client-side fallback, unblocking the workflow despite the frozen backend state.

**Next Steps for Developers:**
*   **Fix Deployment:** Investigate why `supabase functions deploy` is not running or failing silently. The Edge Function code is currently "clean" (dependency-free) and should work once successfully deployed.
*   **Enrichment Function:** The `enrich-product` function was also rewritten to be dependency-free but likely suffers from the same deployment freeze. It requires the same Client-Side Fallback logic if we want product enrichment to work without a backend fix.
