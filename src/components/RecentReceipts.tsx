
import { useEffect, useState } from 'react';
import { supabase } from '../integrations/supabase/client';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Camera } from 'lucide-react';

// Define the type for a receipt
interface Receipt {
  id: string;
  receipt_date: string;
  store_name: string;
  total_amount: number;
  processing_status: string;
  image_url: string;
  ocr_text: string;
  items: any[];
}

interface RecentReceiptsProps {
  onEditReceipt: (receipt: Receipt) => void;
}

const RecentReceipts = ({ onEditReceipt }: RecentReceiptsProps) => {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReceipts();
  }, []);

  const fetchReceipts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('receipts')
      .select('*, items:receipt_items(*)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching receipts:', error);
      setError(error.message);
    } else {
      setReceipts(data as Receipt[]);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('receipts').delete().eq('id', id);

    if (error) {
      console.error('Error deleting receipt:', error);
      setError(error.message)
    } else {
      setReceipts(receipts.filter((r) => r.id !== id));
    }
  };

  if (error) {
    return <div>Error loading receipts: {error}</div>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Receipts</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center text-muted-foreground">Loading receipts...</div>
        ) : receipts.length === 0 ? (
          <div className="text-center py-12">
            <Camera className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No Receipts Found</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Your scanned receipts will appear here. Get started by capturing your first receipt!
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Store</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receipts.map((receipt) => (
                <TableRow key={receipt.id}>
                  <TableCell>{new Date(receipt.receipt_date).toLocaleDateString()}</TableCell>
                  <TableCell>{receipt.store_name}</TableCell>
                  <TableCell>${receipt.total_amount.toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant={receipt.processing_status === 'completed' ? 'success' : 'secondary'}>
                      {receipt.processing_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => onEditReceipt(receipt)}>Edit</Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(receipt.id)} className="ml-2">Delete</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

export default RecentReceipts;
