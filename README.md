# StrataFuse

StrataFuse is a premium, open-source desktop cloud-mounting client wrapping Rclone. Built with Tauri, React, TypeScript, and Rust, it allows you to mount cloud storage providers natively as local drives on your computer.

It provides automatic VFS cache tuning, dynamic system tray integrations, automated log management, and system boot autostart controls.

---

## Key Features

* **Multi-Provider Cloud Mounting:** Seamlessly mount Google Drive, Microsoft OneDrive, Dropbox, Amazon S3, Proton Drive, and other rclone-supported backends.
* **VFS Cache Tuning Presets:** Optimized virtual file system configurations out of the box:
  * **Media Streaming:** Full VFS file cache, 100GB maximum limit, and network mode settings tailored for Plex/Jellyfin/VLC streaming.
  * **General Purpose:** Write-cached files, 10GB limit for daily office work and file operations.
  * **Backup / Sync:** Minimal 1GB cache mode optimized for raw, high-throughput backups.
* **Dynamic System Tray Controls:** List your mount profiles directly from the taskbar system tray menu. You can mount or unmount profiles contextually with a single click without opening the GUI.
* **"Open in Explorer" Integration:** Reveal active mount drive letters (e.g. `Z:\` or `S:\`) directly in Windows Explorer with a single click.
* **Startup Autostart:** Automatically launches minimized to the system tray on Windows startup and mounts any profiles set to auto-mount.
* **Zero-Knowledge Encryption:** Native integration with rclone's crypt layer to encrypt files locally before they are uploaded to public cloud providers.
* **Live Performance Monitoring:** View active download/upload speeds, transferred sizes, VFS cache storage utilization, and real-time logs inside the dashboard.

---

## Google Cloud Platform (GCP) OAuth Setup Guide

To mount Google Drive without hitting API rate limits or experiencing `403 Rate Limit Exceeded` crashes under heavy usage, you should configure your own **Google Client ID and Client Secret**. Using Google's default shared credentials will result in slower response times and API throttle blocks.

Follow these step-by-step instructions to create your own GCP API credentials:

### 1. Create a Google Cloud Project
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Log in with your Google Account.
3. Click the project dropdown in the top-left corner and click **New Project**.
4. Name the project (e.g., `StrataFuse Drive Mount`) and click **Create**.

### 2. Enable the Google Drive API
1. In the search bar at the top, search for **Google Drive API**.
2. Select the API from the search results and click **Enable**.

### 3. Configure the OAuth Consent Screen
1. In the left navigation sidebar, click **APIs & Services** -> **OAuth consent screen**.
2. Select **User Type** as **External** and click **Create**.
3. Fill in the required fields:
   * **App name:** `StrataFuse`
   * **User support email:** Select your Gmail address.
   * **Developer contact information:** Enter your email address.
4. Click **Save and Continue**.
5. **Scopes (Optional):** Under **Scopes**, simply click **Save and Continue**. You can leave this blank/default because Rclone requests the necessary Google Drive permissions (`/auth/drive`) dynamically at runtime.
6. **Important (Test Users):** Under **Test users**, click **Add Users** and add your own Google email address. While your GCP project is in "Testing" mode, only designated test users can complete the OAuth authentication process.
7. Click **Save and Continue** to finish.

### 4. Create OAuth Client ID Credentials
1. In the left sidebar, click **Credentials**.
2. Click **+ Create Credentials** at the top and select **OAuth client ID**.
3. Under **Application type**, select **Desktop app** (*Important: Do not choose "Web application", as it requires manual redirect URI whitelisting. "Desktop app" allows Rclone to loopback dynamically out of the box*).
4. Set the **Name** (e.g., `StrataFuse Desktop Client`).
5. Click **Create**.
6. A dialog box will display your **Client ID** and **Client Secret**. Copy these values.
7. Paste them into the StrataFuse setup wizard when configuring a Google Drive profile.

---

## Developer Guide

### Prerequisites
* [Node.js](https://nodejs.org/) (v18 or higher recommended)
* [Rust & Cargo compiler toolchain](https://rustup.rs/)
* C++ Build tools (MSVC on Windows, Xcode tools on macOS, or build-essential on Linux)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/sudoaanish/StrataFuse.git
   cd StrataFuse
   ```
2. Install package dependencies:
   ```bash
   npm install
   ```
   *Note: On `npm install`, a postinstall setup script (`scripts/setup-rclone.js`) automatically detects your host operating system and CPU architecture, downloads the official corresponding `rclone` binary, and registers it as a sidecar binary inside `src-tauri/binaries/`.*

### Development commands
* Run the application in hot-reloading development mode:
  ```bash
  npm run dev
  ```
  And in a separate terminal:
  ```bash
  npm run tauri dev
  ```
* Build and package the production installers (MSI / EXE / DMG):
  ```bash
  npm run tauri build
  ```

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Author

Created and developed by **Aanish Farrukh** ([sudoaanish](https://github.com/sudoaanish)).
