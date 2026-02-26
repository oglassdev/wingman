# IntelliJ Plugin Best Practices (Kotlin)

## Gradle / Build Setup

```kotlin
// build.gradle.kts
plugins {
  id("org.jetbrains.intellij.platform") version "2.x.x"
  kotlin("jvm") version "2.x.x"
}

intellijPlatform {
  pluginConfiguration {
    ideaVersion {
      sinceBuild = "241"  // IntelliJ 2024.1+
    }
  }
}

dependencies {
  intellijPlatform {
    intellijIdeaCommunity("2024.1")
    pluginVerifier()
    zipSigner()
    instrumentationTools()
  }
}
```

- Use the IntelliJ Platform Gradle Plugin v2 (not the legacy `org.jetbrains.intellij`).
- Do NOT manually depend on OkHttp — IntelliJ bundles OkHttp.

## Threading Model — The Golden Rule

IntelliJ has two critical thread rules:
1. **Read actions** must run on the EDT or inside `ReadAction.run {}` / `ReadAction.compute {}`
2. **Write actions** (modifying PSI, documents) must run inside `WriteCommandAction.runWriteCommandAction {}` on the EDT

```kotlin
// WRONG — modifying document off EDT
Thread {
  document.insertString(offset, code) // crash!
}.start()

// CORRECT
ApplicationManager.getApplication().invokeLater {
  WriteCommandAction.runWriteCommandAction(project) {
    document.insertString(offset, code)
  }
}
```

## HTTP Calls — Never on EDT

All network I/O must happen on a background thread:

```kotlin
// WRONG
class MyAction : AnAction() {
  override fun actionPerformed(e: AnActionEvent) {
    val result = httpClient.get("/health") // blocks EDT!
  }
}

// CORRECT — use a background task
class OpenWingmanAction : AnAction() {
  override fun actionPerformed(e: AnActionEvent) {
    val project = e.project ?: return
    object : Task.Backgroundable(project, "Checking Wingman...", false) {
      override fun run(indicator: ProgressIndicator) {
        val health = wingmanClient.getHealth()
        if (health != null) {
          wingmanClient.postContext(...)
        } else {
          launchWingman(...)
        }
      }
    }.queue()
  }
}
```

## OkHttp SSE Streaming

IntelliJ bundles OkHttp. Read SSE line by line from the `ResponseBody`:

```kotlin
fun readSse(port: Int, onToken: (String) -> Unit) {
  val client = OkHttpClient()
  val request = Request.Builder().url("http://localhost:$port/inline").get().build()
  val call = client.newCall(request)
  val response = call.execute() // blocking — must be on background thread
  response.body?.use { body ->
    body.source().use { source ->
      while (!source.exhausted()) {
        val line = source.readUtf8Line() ?: break
        if (line.startsWith("data: ")) {
          val token = line.removePrefix("data: ").trim()
          if (token == "[DONE]") break
          onToken(token)
        }
      }
    }
  }
}
```

## InlineCompletionProvider (2024.1+)

Use `InlineCompletionProvider` (not the older `EditorInlayHintsProvider`):

```kotlin
class WingmanInlineProvider : InlineCompletionProvider {
  override val id = InlineCompletionProviderID("com.wingman.inline")

  override suspend fun getSuggestion(request: InlineCompletionRequest): InlineCompletionSuggestion {
    val editor = request.editor
    val offset = editor.caretModel.offset
    val document = editor.document
    val port = WingmanPortFile.read()

    // Build surrounding code
    val lineNum = document.getLineNumber(offset)
    val surroundingCode = extractSurroundingLines(document, lineNum, 20, 10)

    // Post context (use coroutine-friendly IO)
    withContext(Dispatchers.IO) {
      postContext(port, document.getPsiFile()?.virtualFile?.path, lineNum, surroundingCode)
    }

    // Collect SSE
    val sb = StringBuilder()
    withContext(Dispatchers.IO) {
      readSse(port) { token -> sb.append(token) }
    }

    return InlineCompletionSuggestion.Default(
      InlineCompletionGrayTextElement(sb.toString())
    )
  }

  override fun isEnabled(event: InlineCompletionEvent): Boolean = WingmanSettings.isEnabled()
}
```

## Debounce — Use Coroutine Job Cancellation

`InlineCompletionProvider.getSuggestion` is a suspend function — debounce is handled by IntelliJ's platform automatically. If using a legacy listener, use coroutine `Job`:

```kotlin
private var debounceJob: Job? = null
private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

fun onTextChanged() {
  debounceJob?.cancel()
  debounceJob = scope.launch {
    delay(300)
    // ... trigger completion
  }
}
```

## plugin.xml — Required Entries

```xml
<idea-plugin>
  <id>com.wingman.plugin</id>
  <name>Wingman</name>
  <vendor>Wingman</vendor>
  <depends>com.intellij.modules.platform</depends>

  <extensions defaultExtensionNs="com.intellij">
    <inlineCompletionProvider
      implementation="com.wingman.WingmanInlineProvider"
      language="any"/>
    <applicationConfigurable
      instance="com.wingman.WingmanSettingsConfigurable"
      parentId="tools"/>
    <applicationService
      serviceImplementation="com.wingman.WingmanSettingsState"/>
  </extensions>

  <actions>
    <action id="Wingman.Open"
            class="com.wingman.OpenWingmanAction"
            text="Open Wingman"
            description="Open Wingman with current context">
      <add-to-group group-id="EditorPopupMenu" anchor="last"/>
    </action>
  </actions>
</idea-plugin>
```

## Settings Persistence

Use `@State` + `PersistentStateComponent`:

```kotlin
@State(name = "WingmanSettings", storages = [Storage("wingman.xml")])
@Service(Service.Level.APP)
class WingmanSettingsState : PersistentStateComponent<WingmanSettingsState.State> {
  data class State(var port: Int = 7891, var enabled: Boolean = true)
  private var state = State()
  override fun getState() = state
  override fun loadState(state: State) { this.state = state }

  companion object {
    fun getInstance(): WingmanSettingsState =
      ApplicationManager.getApplication().getService(WingmanSettingsState::class.java)
  }
}
```
