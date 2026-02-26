# Wingman Justfile - Task runner for the monorepo
# https://github.com/casey/just

# Default recipe - show available commands
default:
    @just --list

# === Development ===

# Start the Wingman app (server + UI)
dev:
    bun run dev

# Start with HMR enabled
dev-hmr:
    bun run dev:hmr

# Start only the inference server (without UI)
dev-server:
    cd apps/server && bun run dev

# Build the entire project
build:
    bun run build

# Clean build artifacts
clean:
    bun run clean

# === Editor Extensions ===

# Build all extensions
build-ext: build-vscode build-intellij build-zed

# Build VS Code extension
build-vscode:
    @echo "[VS Code] Building extension..."
    cd extensions/vscode && npm install && npm run compile
    @echo "[VS Code] Extension built"

# Build IntelliJ plugin  
build-intellij:
    @echo "[IntelliJ] Building plugin..."
    cd extensions/intellij && gradle buildPlugin
    @echo "[IntelliJ] Plugin built"

# Build Zed extension
build-zed:
    @echo "[Zed] Building extension..."
    cd extensions/zed && cargo build --target wasm32-wasi --release
    @echo "[Zed] Extension built"

# Install all extensions
install-ext: install-vscode install-intellij install-zed

# Install VS Code extension
install-vscode: build-vscode
    @echo "[VS Code] Installing extension..."
    cd extensions/vscode && npx vsce package --no-dependencies 2>/dev/null || npm install -g vsce
    -code --install-extension extensions/vscode/wingman-*.vsix --force
    @echo "[VS Code] Extension installed"

# Install IntelliJ plugin (prints instructions)
install-intellij: build-intellij
    @echo "[IntelliJ] Plugin built at:"
    @echo "   extensions/intellij/build/distributions/wingman-0.1.0.zip"
    @echo ""
    @echo "   Install manually:"
    @echo "   1. Open IntelliJ IDEA → Settings → Plugins"
    @echo "   2. Click gear icon → 'Install from disk'"
    @echo "   3. Select the zip file above"

# Install Zed extension (prints instructions)
install-zed: build-zed
    @echo "[Zed] Extension built at:"
    @echo "   extensions/zed/target/wasm32-wasi/release/wingman.wasm"
    @echo ""
    @echo "   Install manually:"
    @echo "   1. Open Zed → extensions panel"
    @echo "   2. Click 'Install Dev Extension'"
    @echo "   3. Select the .wasm file above"

# === Development Mode for Extensions ===

# Run VS Code extension in development host
dev-vscode: build-vscode
    @echo "[VS Code] Opening extension in development host..."
    code --extensionDevelopmentPath="extensions/vscode" extensions/vscode

# Run IntelliJ plugin in development IDE
dev-intellij:
    @echo "[IntelliJ] Starting plugin in development mode..."
    cd extensions/intellij && gradle runIde

# Build Zed extension for development (debug build)
dev-zed:
    @echo "[Zed] Building extension for development..."
    cd extensions/zed && cargo build --target wasm32-wasi
    @echo ""
    @echo "Extension built at: extensions/zed/target/wasm32-wasi/debug/wingman.wasm"

# === Utility ===

# Check prerequisites
setup-check:
    @echo "Checking prerequisites..."
    @which bun > /dev/null && echo "[OK] Bun: $(bun --version)" || echo "[MISSING] Bun not found"
    @which node > /dev/null && echo "[OK] Node: $(node --version)" || echo "[MISSING] Node not found"
    @which gradle > /dev/null && echo "[OK] Gradle: $(gradle --version | head -1)" || echo "[MISSING] Gradle not found"
    @which cargo > /dev/null && echo "[OK] Cargo: $(cargo --version)" || echo "[MISSING] Cargo not found"
    @rustup target list --installed | grep -q wasm32-wasi && echo "[OK] wasm32-wasi target installed" || echo "[WARN] Run: rustup target add wasm32-wasi"

# Format all code
format:
    @echo "Formatting TypeScript..."
    -cd apps/server && bunx prettier --write "src/**/*.ts"
    -cd apps/client && bunx prettier --write "src/**/*.{ts,tsx}"
    -cd extensions/vscode && npx prettier --write "src/**/*.ts"
    @echo "Formatting Kotlin..."
    -cd extensions/intellij && gradle ktlintFormat 2>/dev/null || true
    @echo "Formatting Rust..."
    -cd extensions/zed && cargo fmt
    @echo "[DONE] Formatting complete"

# Run linting
lint:
    bun run lint

# === Git Workflow Helpers ===

# Create a feature commit
feat msg:
    git commit -m "feat: {{msg}}"

# Create a fix commit  
fix msg:
    git commit -m "fix: {{msg}}"

# Create a chore commit
chore msg:
    git commit -m "chore: {{msg}}"

# Create a doc commit
doc msg:
    git commit -m "doc: {{msg}}"

# Check git status and provide commit guidance
status:
    @git status
    @echo ""
    @echo "Use conventional commits:"
    @echo "  just feat 'add new feature'"
    @echo "  just fix 'resolve bug'"
    @echo "  just chore 'update dependencies'"
    @echo "  just doc 'update documentation'"
