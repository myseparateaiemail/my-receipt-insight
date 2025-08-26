import { Camera, BarChart3, Receipt, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Header = () => {
  return (
    <header className="bg-background border-b border-border sticky top-0 z-50 backdrop-blur-md bg-background/95">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-primary-glow">
              <Receipt className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">ReceiptTracker</h1>
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
          </nav>
        </div>
      </div>
    </header>
  );
};