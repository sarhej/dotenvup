# DotEnvUp File Type Registration

This document defines the canonical file type identifiers for `.env.up` files so that operating systems, editors, and tools can recognize them as DotEnvUp encrypted environment files.

## File Extensions

| Extension | Description |
|-----------|-------------|
| `.env.up` | Primary extension for DotEnvUp encrypted environment files |
| `.up` | Short alias (less common; may conflict with other tools) |

The recommended extension is `.env.up`. The `.up` alias is supported but optional.

## MIME Types

| MIME Type | Usage |
|-----------|-------|
| `application/vnd.dotenvup.encrypted` | Canonical MIME type (vendor namespace, IANA-friendly) |
| `application/x-env-up` | Informal/experimental alias |

Use `application/vnd.dotenvup.encrypted` for any formal registration (Linux shared-mime-info, HTTP content-type headers, etc.).

## macOS — Uniform Type Identifier (UTI)

| UTI | Description |
|-----|-------------|
| `com.unknownpassword.env-up` | Canonical UTI for `.env.up` files |

Conforms to: `public.data`, `public.text`.

To register, declare the UTI in an app's `Info.plist` under `UTImportedTypeDeclarations` or `UTExportedTypeDeclarations`:

```xml
<dict>
  <key>UTTypeIdentifier</key>
  <string>com.unknownpassword.env-up</string>
  <key>UTTypeDescription</key>
  <string>DotEnvUp Encrypted Environment File</string>
  <key>UTTypeConformsTo</key>
  <array>
    <string>public.data</string>
    <string>public.text</string>
  </array>
  <key>UTTypeTagSpecification</key>
  <dict>
    <key>public.filename-extension</key>
    <array>
      <string>env.up</string>
      <string>up</string>
    </array>
    <key>public.mime-type</key>
    <string>application/vnd.dotenvup.encrypted</string>
  </dict>
</dict>
```

## Windows — File Type Association

Register `.env.up` (and optionally `.up`) in the Windows registry:

- **Friendly type name:** "DotEnvUp Encrypted Env" (or "UnknownPassword Encrypted Env")
- **Default "Open with":** VS Code, or the UnknownPassword helper app
- **Custom icon:** Ship with the CLI installer or VS Code extension

Registry path example:

```
HKEY_CLASSES_ROOT\.env.up
  (Default) = "DotEnvUp.EncryptedEnv"

HKEY_CLASSES_ROOT\DotEnvUp.EncryptedEnv
  (Default) = "DotEnvUp Encrypted Env"
  DefaultIcon = "<path>\dotenvup-icon.ico"
  shell\open\command = "code" "%1"
```

This is best done by a dedicated installer (e.g. `.msi` or Inno Setup). The VS Code extension handles this within VS Code automatically.

## Linux / Cross-Platform — shared-mime-info

Create an XML file (e.g. `dotenvup-mime.xml`) and install to `/usr/share/mime/packages/`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
  <mime-type type="application/vnd.dotenvup.encrypted">
    <comment>DotEnvUp Encrypted Environment File</comment>
    <glob pattern="*.env.up"/>
    <glob pattern="*.up"/>
    <sub-class-of type="text/plain"/>
  </mime-type>
</mime-info>
```

Then run `update-mime-database /usr/share/mime` to activate.

## VS Code Extension

The DotEnvUp VS Code extension already registers `.env.up` and `.up` as a recognized language with:
- Custom file icon (light/dark variants)
- Syntax highlighting for the `.env.up` format
- MIME types: `application/vnd.dotenvup.encrypted`, `application/x-env-up`

This means VS Code users get file recognition, icons, and syntax coloring out of the box.

## Implementation Status

| Platform | Status |
|----------|--------|
| VS Code | Done (language, icon, syntax, MIME) |
| Linux shared-mime-info | Documented (install with CLI package or manually) |
| macOS UTI | Documented (register via app bundle or CLI installer) |
| Windows registry | Documented (register via installer) |

OS-level registration (outside VS Code) will be implemented when native installers are built. The identifiers above are canonical and should be used by any tool integrating with the `.env.up` format.

## For Tool Authors

If you are building a tool that works with `.env.up` files, use the identifiers above. The format is open (MIT licensed) and documented at [github.com/sarhej/dotenvup](https://github.com/sarhej/dotenvup). For seamless team sharing on top of this format: [unknownpassword.com](https://unknownpassword.com).
