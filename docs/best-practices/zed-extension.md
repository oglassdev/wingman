# Zed Extension Best Practices (Rust)

## WASM Target — No Std Networking

Zed extensions compile to `wasm32-wasi`. **There is no standard networking in WASM.** Do not use `reqwest`, `ureq`, or `std::net`. All HTTP must go through Zed's extension host API:

```toml
# Cargo.toml
[dependencies]
zed_extension_api = { git = "https://github.com/zed-industries/zed", tag = "v0.x.x" }
```

```rust
// Correct — use Zed's built-in http_client
use zed_extension_api::{self as zed, http_client::{HttpClient, Method, Request}};

fn call_wingman(port: u16) -> zed::Result<String> {
  let client = HttpClient::new();
  let response = client.send(
    Request::builder()
      .method(Method::Get)
      .uri(&format!("http://localhost:{port}/health"))
      .build()
  )?;
  Ok(response.body_text()?)
}
```

## Extension Trait — Implement `zed::Extension`

```rust
use zed_extension_api as zed;

struct WingmanExtension;

impl zed::Extension for WingmanExtension {
  fn new() -> Self { WingmanExtension }
}

zed::register_extension!(WingmanExtension);
```

## Slash Commands

```rust
impl zed::Extension for WingmanExtension {
  fn run_slash_command(
    &self,
    command: zed::SlashCommand,
    arguments: &[String],
    worktree: Option<&zed::Worktree>,
  ) -> zed::Result<zed::SlashCommandOutput> {
    // arguments[0] is the user's prompt text
    let prompt = arguments.join(" ");
    let port = self.read_port();

    // POST context, then GET generate — synchronous in WASM
    let output = self.call_generate(port, &prompt)?;

    Ok(zed::SlashCommandOutput {
      sections: vec![zed::SlashCommandOutputSection {
        range: 0..output.len(),
        label: "Wingman".into(),
      }],
      text: output,
    })
  }
}
```

## No Async — Zed WASM Extensions Are Synchronous

Do NOT use `async fn` in Zed extensions. The WASM runtime is synchronous. All calls block the extension fiber.

```rust
// WRONG
async fn call_health() -> Result<Health> { ... }

// CORRECT
fn call_health() -> zed::Result<Health> { ... }
```

## Reading the Port File

Zed runs on macOS — `std::env::temp_dir()` works in WASM/WASI:

```rust
fn read_port(&self) -> u16 {
  let port_path = std::env::temp_dir().join("wingman.port");
  std::fs::read_to_string(port_path)
    .ok()
    .and_then(|s| s.trim().parse().ok())
    .unwrap_or(7891)
}
```

## extension.toml

```toml
[extension]
id = "wingman"
name = "Wingman"
version = "0.1.0"
description = "Wingman AI code assistant"
authors = ["Wingman"]
repository = "https://github.com/yourorg/wingman"

[extension.slash_commands.wingman]
description = "Generate code with Wingman AI"
requires_argument = true
```

## Error Handling — Use `?` and `zed::Result`

```rust
// CORRECT
fn get_completion(&self) -> zed::Result<String> {
  let port = self.read_port();
  let resp = self.http_client.send(request)?; // ? propagates zed::Error
  Ok(resp.body_text()?)
}

// WRONG — panic will crash the extension host
fn get_completion(&self) -> String {
  let resp = self.http_client.send(request).unwrap();
  resp.body_text().unwrap()
}
```
