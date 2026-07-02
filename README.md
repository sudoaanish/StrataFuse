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
* **VFS Cache Purging:** Securely clear local cached file chunks directly from disk with a single click inside the dashboard to instantly recover local storage.
* **Bandwidth Throttling / Speed Limits:** Select and throttle your cloud drive sync speeds (No Limit, 10MB/s, 5MB/s, 2MB/s, 1MB/s) dynamically inside the setup wizard.
* **Cloud Storage Utilization Gauge:** Live progress stats showing your remote cloud drive storage limits, used disk space, and free capacity.
* **Dynamic System Tray Controls:** List your mount profiles directly from the taskbar system tray menu. You can mount or unmount profiles contextually with a single click without opening the GUI.
* **"Open in Explorer" Integration:** Reveal active mount drive letters (e.g. `Z:\` or `S:\`) directly in Windows Explorer with a single click.
* **Startup Autostart:** Automatically launches minimized to the system tray on Windows startup and mounts any profiles set to auto-mount.
* **Zero-Knowledge Encryption:** Native integration with rclone's crypt layer to encrypt files locally before they are uploaded to public cloud providers.
* **Live Performance Monitoring:** View active download speeds, transferred sizes, and real-time logs inside the dashboard.

---

## Installation & Setup Guide

### Which Asset Should You Download?

When visiting the **[Releases](https://github.com/sudoaanish/StrataFuse/releases)** page on GitHub, download the package matching your operating system and user preference:

| Operating System | Recommended Download | Best For |
| :--- | :--- | :--- |
| **Windows 10/11** | `StrataFuse_x.x.x_x64-setup.exe` | **Recommended.** Lightweight, standard setup wizard. Installable without administrator rights. |
| **Windows 10/11** | `StrataFuse_x.x.x_x64_en-US.msi` | Standard MSI installer package. Best for enterprise deployments. |
| **macOS (Intel/Apple Silicon)** | `StrataFuse_x.x.x_universal.dmg` | **Recommended.** Drag-and-drop installer volume that runs on both Intel and Apple Silicon Macs natively. |
| **Linux (Ubuntu/Debian)** | `StrataFuse_0.2.1_amd64.deb` | Debian installer package. Best for Ubuntu, Debian, Mint, etc. |
| **Linux (Fedora/CentOS)** | `StrataFuse-0.2.1-1.x86_64.rpm` | Red Hat Package Manager format. Best for Fedora, CentOS, RHEL, etc. |
| **Linux (Any Distro)** | `StrataFuse_0.2.1_amd64.AppImage` | Standalone portable executable. Runs on any distribution without installation. |

> [!NOTE]
> The `.sig` files uploaded alongside installers are cryptographic signatures. They are used by the in-app auto-updater to verify installer integrity and block tamper or man-in-the-middle attacks. You do not need to download them manually.

---

### Step-by-Step Installation Guides

#### 🖥️ Installing on Windows
1. Download `StrataFuse_0.2.1_x64-setup.exe` from the [Releases](https://github.com/sudoaanish/StrataFuse/releases) page.
2. Double-click the downloaded setup file to launch the installer wizard.
3. Follow the prompts to finish the installation.
4. Launch **StrataFuse** from your Desktop shortcut or the Start Menu!
5. **Next Step (Important):** If you are configuring a Google Drive mount, skip the *Developer Guide* and go directly to the [Google Cloud Platform (GCP) OAuth Setup Guide](#google-cloud-platform-gcp-oauth-setup-guide) below to set up your API credentials.

#### 🍏 Installing on macOS (Unsigned App Override)
StrataFuse releases on macOS are unsigned Universal DMGs. To bypass macOS security gatekeeper warning screens:
1. Download `StrataFuse_0.2.1_universal.dmg` from the [Releases](https://github.com/sudoaanish/StrataFuse/releases) page.
2. Double-click the `.dmg` file to open it, then drag the **StrataFuse** icon into your **Applications** folder.
3. Open your **Applications** folder, right-click (or control-click) **StrataFuse**, and select **Open**.
4. A warning dialog will appear saying the developer cannot be verified. Click **Open** (or go to **System Settings > Privacy & Security** and click **Open Anyway** under the security section). You only need to do this once.

#### 🐧 Installing on Linux
*   **Via AppImage (Easiest):**
    1. Download `StrataFuse_0.2.1_amd64.AppImage`.
    2. Right-click the downloaded file, go to **Properties > Permissions**, and check **Allow executing file as program** (or run `chmod +x StrataFuse_0.2.1_amd64.AppImage` in your terminal).
    3. Double-click to run!
*   **Via DEB (Ubuntu/Debian):**
    1. Download `StrataFuse_0.2.1_amd64.deb`.
    2. Open your terminal and run:
       ```bash
       sudo apt install ./StrataFuse_0.2.1_amd64.deb
       ```
    3. Launch StrataFuse from your desktop application menu.

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

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Author

Created and developed by **Aanish Farrukh** ([sudoaanish](https://github.com/sudoaanish)).
