/retest

Hi @probonopd — thanks for the invitation, and sorry for the slow reply!

HexoManager now ships a bilingual (Chinese / English) interface, and **English is the default outside a Chinese locale**. The new build is in the latest release: **v1.2.0**.

How the locale is resolved (highest priority first):

1. An explicit choice under *Preferences → General → Interface language* (Follow system / 简体中文 / English), persisted in `localStorage`.
2. Otherwise the system locale, as seen by the webview through `navigator.language` / `navigator.languages` (WebKitGTK derives it from `LANG` / `LC_*`):
   - anything starting with `zh` → Simplified Chinese;
   - **everything else — `en_US`, `de_DE`, `C`, `POSIX`, unset — → English**.

Implementation notes, in case they are useful for the review:

- No i18n framework was added: the Chinese source string *is* the translation key (`t('文章管理')`), and a flat dictionary maps it to English. Unmatched entries fall back to Chinese, so a raw key is never rendered.
- Switching the language also updates the Ant Design locale, the dayjs locale, `<html lang>` and the window title.
- Coverage is enforced by a script that fails when a term has no translation **or when a translation still contains CJK characters** — so an English screenshot should carry no Chinese script. Current state: 1356 terms, 0 untranslated, 0 translations containing CJK.
- The 250+ Chinese error messages returned by the Rust backend keep their `Result<T, String>` signatures; they are mapped to English in a thin frontend layer (`src/i18n/backendMessages.ts`).

The AppImage asset for this release is `HexoManager_1.2.0_amd64.AppImage`.

I have added `/retest` above so the entry gets re-tested against v1.2.0 — please let me know if anything still shows up. And if you would prefer the asset to be named `HexoManager-1.2.0-x86_64.AppImage`, I am happy to rename it.

---

你好 @probonopd，感谢邀请，回复晚了抱歉！

HexoManager 现已支持中英双语界面，**在非中文环境下默认显示英文**。新的构建在最新版本 **v1.2.0** 中。

语言判定优先级（从高到低）：

1. 用户在「偏好设置 → 常规 → 界面语言」中显式选择（跟随系统 / 简体中文 / English），持久化在 `localStorage`
2. 否则读取系统语言（webview 通过 `navigator.language` / `navigator.languages` 获得，WebKitGTK 由 `LANG` / `LC_*` 推导）：
   - 以 `zh` 开头 → 简体中文
   - **其余一切（`en_US`、`de_DE`、`C`、`POSIX`、未设置）→ 英文**

实现要点（供审核参考）：

- 未引入 i18n 框架：**中文原文即词条**（`t('文章管理')`），英文译文放在一张平坦的字典里；未命中的条目回退中文，界面上永远不会出现裸露的 key
- 切换语言会同步更新 Ant Design locale、dayjs 区域、`<html lang>` 与窗口标题
- 覆盖率由脚本卡口：**缺译文、或英文译文里仍残留中日韩字符**都会失败 —— 因此英文截图里不应再出现中文。当前：1356 条词条，缺译文 0，译文残留中文 0
- Rust 后端的 250+ 条中文错误保持 `Result<T, String>` 既有签名，通过前端一层映射表（`src/i18n/backendMessages.ts`）转英文

本版本的 AppImage 资产为 `HexoManager_1.2.0_amd64.AppImage`。

上面已加 `/retest` 触发针对 v1.2.0 的重测，若仍有问题请告诉我。如果希望资产名改成 `HexoManager-1.2.0-x86_64.AppImage`，我也可以调整。
