{pkgs}: {
  channel = "stable-24.05";
  packages = [
    pkgs.nodejs_20
    pkgs.supabase-cli
  ];
  idx.extensions = [
    "dbaeumer.vscode-eslint"
    "bradlc.vscode-tailwindcss"
    "csstools.postcss"
    "esbenp.prettier-vscode"
    "zardoy.nix-ide"
  ];
  idx.previews = {
    enable = true;
    previews = {
      web = {
        command = ["npm" "run" "dev" "--" "--port" "$PORT" "--host" "0.0.0.0"];
        manager = "web";
      };
    };
  };
}
