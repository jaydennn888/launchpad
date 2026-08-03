$env:PATH = 'E:\rust\cargo\bin;' + $env:PATH
$env:RUSTUP_HOME = 'E:\rust\rustup'
$env:CARGO_HOME = 'E:\跑ai\cargo-home'
$env:CARGO_TARGET_DIR = 'E:\launchpad-build'

Set-Location 'E:\跑ai\6a656cc824f75d40323b3279\desktop-launcher\src-tauri'
cargo fetch 2>&1