use zed_extension_api::{self as zed, SlashCommand, SlashCommandOutput, Worktree};

struct WingmanExtension;

impl zed::Extension for WingmanExtension {
    fn new() -> Self {
        WingmanExtension
    }

    fn run_slash_command(
        &self,
        _command: SlashCommand,
        arguments: &[String],
        _worktree: Option<&Worktree>,
    ) -> zed::Result<SlashCommandOutput> {
        let prompt = arguments.join(" ");

        Ok(SlashCommandOutput {
            sections: vec![zed::SlashCommandOutputSection {
                range: 0..prompt.len(),
                label: "Wingman".into(),
            }],
            text: format!("Wingman received: {}", prompt),
        })
    }
}

zed::register_extension!(WingmanExtension);
