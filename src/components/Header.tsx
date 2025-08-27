import { Camera, BarChart3, Settings, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import receiptLettuceIcon from "@/assets/receipt-lettuce-icon.png";

export const Header = () => {
  const { signOut, user } = useAuth();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <header className="bg-background border-b border-border sticky top-0 z-50 backdrop-blur-md bg-background/95">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-primary-glow">
              <img src={receiptLettuceIcon} alt="Receipt with lettuce" className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">grocer</h1>
              <p className="text-sm text-muted-foreground">Smart grocery analytics</p>
            </div>
          </div>
          
          <nav className="hidden md:flex items-center gap-2">
            <Button variant="ghost" size="sm">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </Button>
            <Button variant="ghost" size="sm">
              <Camera className="h-4 w-4" />
              Capture
            </Button>
            <Button variant="ghost" size="sm">
              <Settings className="h-4 w-4" />
              Settings
            </Button>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </nav>
          
          {/* Mobile menu */}
          <div className="md:hidden">
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};