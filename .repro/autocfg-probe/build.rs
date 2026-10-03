// 精确复刻 autocfg::probe_fmt 的调用方式：
//   rustc --crate-name <n> --crate-type=lib --out-dir <OUT_DIR> --emit=llvm-ir -
//   源码从 stdin 传入
// 目的：拿到 autocfg 探针在本机失败的真实 stderr。

use std::io::Write;
use std::process::{Command, Stdio};

fn main() {
    println!(
        "cargo:warning=CARGO_FEATURE_STD={:?}",
        std::env::var_os("CARGO_FEATURE_STD")
    );

    let ac = autocfg::new();
    println!(
        "cargo:warning=probe_sysroot_crate(std)={}",
        ac.probe_sysroot_crate("std")
    );

    let out_dir = std::env::var("OUT_DIR").unwrap();
    let rustc = std::env::var_os("RUSTC").unwrap_or_else(|| "rustc".into());

    let mut child = Command::new(&rustc)
        .arg("--crate-name")
        .arg("probe_manual")
        .arg("--crate-type=lib")
        .arg("--out-dir")
        .arg(&out_dir)
        .arg("--emit=llvm-ir")
        .arg("-")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(b"extern crate std as probe;\n")
        .unwrap();
    let o = child.wait_with_output().unwrap();
    println!("cargo:warning=精确复刻 status={}", o.status);
    println!(
        "cargo:warning=stderr={}",
        String::from_utf8_lossy(&o.stderr).trim().replace('\n', " | ")
    );
}
