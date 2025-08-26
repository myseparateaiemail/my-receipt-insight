import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Receipt, MapPin, Clock, Eye } from "lucide-react";

export const RecentReceipts = () => {
  const receipts = [
    {
      id: 1,
      store: "Whole Foods Market",
      amount: "$87.43",
      date: "Today, 2:30 PM",
      items: 12,
      status: "processed",
      location: "Downtown"
    },
    {
      id: 2,
      store: "Trader Joe's",
      amount: "$45.67",
      date: "Yesterday, 6:15 PM",
      items: 8,
      status: "processed", 
      location: "Westside"
    },
    {
      id: 3,
      store: "Safeway",
      amount: "$123.89",
      date: "3 days ago",
      items: 18,
      status: "processing",
      location: "North Beach"
    },
    {
      id: 4,
      store: "Target",
      amount: "$67.21",
      date: "5 days ago", 
      items: 9,
      status: "processed",
      location: "Mission Bay"
    }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          Recent Receipts
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {receipts.map((receipt) => (
            <div 
              key={receipt.id}
              className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Receipt className="h-4 w-4 text-primary" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">{receipt.store}</p>
                    <Badge variant={receipt.status === 'processed' ? 'default' : 'secondary'}>
                      {receipt.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {receipt.date}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {receipt.location}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {receipt.items} items
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="font-semibold text-foreground">{receipt.amount}</p>
                </div>
                <Button variant="ghost" size="sm">
                  <Eye className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};