{pkgs}: {
  channel = "stable-24.05";
  packages = [
    pkgs.nodejs_20
    pkgs.npm
    pkgs.supabase-cli
  ];
  idx.extensions = [
    "dbaeumer.vscode-eslint"
    "bradlc.vscode-tailwindcss"
    "csstools.postcss"
    "esbenp.prettier-vscode"
    "zardoy.nix-ide"
  ];
}
