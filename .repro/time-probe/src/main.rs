//! 复现 + 回归验证：`local_time_to_utc` 的格式识别顺序。
//!
//! 历史 Bug：`%:z` 只匹配 `+08:00`，`...Z` 后缀被漏掉 → 返回 None → 调用方
//! 回退成"不带时间"，Front Matter 的时间就此丢失。修法：先走 RFC 3339，
//! 再补 `+0800`（无冒号）等非标准写法。

fn format_utc<Tz: chrono::TimeZone>(dt: chrono::DateTime<Tz>) -> String {
    dt.with_timezone(&chrono::Utc)
        .format("%Y-%m-%d %H:%M:%S")
        .to_string()
}

fn local_time_to_utc(raw: &str) -> Option<String> {
    let s = raw.trim();
    if s.is_empty() {
        return None;
    }
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
        return Some(format_utc(dt));
    }
    for fmt in [
        "%Y-%m-%dT%H:%M:%S%.f%:z",
        "%Y-%m-%d %H:%M:%S%.f%:z",
        "%Y-%m-%dT%H:%M:%S%.f%z",
        "%Y-%m-%d %H:%M:%S%.f%z",
        "%Y-%m-%dT%H:%M%.f%:z",
        "%Y-%m-%d %H:%M%.f%:z",
    ] {
        if let Ok(dt) = chrono::DateTime::parse_from_str(s, fmt) {
            return Some(format_utc(dt));
        }
    }
    for fmt in [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%dT%H:%M",
    ] {
        if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(s, fmt) {
            return Some(format_utc(naive.and_local_timezone(chrono::Local).single()?));
        }
    }
    let date = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()?;
    let naive = date.and_hms_opt(0, 0, 0)?;
    Some(format_utc(naive.and_local_timezone(chrono::Local).single()?))
}

fn main() {
    let mut failed = 0;
    let mut check = |input: &str, want: Option<&str>| {
        let got = local_time_to_utc(input);
        let ok = got.as_deref() == want;
        if !ok {
            failed += 1;
        }
        println!("{:<4} {:<28} got={:<22?} want={:?}", if ok { "ok" } else { "FAIL" }, input, got, want);
    };

    // 与单测一致的三条断言
    check("2026-11-14T22:00:00+08:00", Some("2026-11-14 14:00:00"));
    check("2026-11-14T22:00:00Z", Some("2026-11-14 22:00:00"));
    check("2026-11-14 22:00:00-05:00", Some("2026-11-15 03:00:00"));
    // 补充边界
    check("2026-11-14T22:00:00.500Z", Some("2026-11-14 22:00:00"));
    check("2026-11-14T22:00:00+0800", Some("2026-11-14 14:00:00"));
    check("", None);
    check("昨天下午", None);
    check("2026-13-45 99:99:99", None);
    println!("--- local tz = {}", chrono::Local::now().offset());
    check("2026-11-14", Some(&local_time_to_utc("2026-11-14 00:00:00").unwrap()));
    println!("failed={failed}");
    if failed > 0 {
        std::process::exit(1);
    }
}
