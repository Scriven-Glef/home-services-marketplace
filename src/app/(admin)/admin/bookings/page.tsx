export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { getAllBookings } from "../actions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { OverrideModal } from "./OverrideModal";
import { AutoRefresher } from "@/components/AutoRefresher";

export default async function BookingsPage() {
  const bookings = await getAllBookings();

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Command Center</h2>
          <p className="text-slate-500 mt-2">
            Overview of all marketplace transactions and active bookings.
          </p>
        </div>
        <AutoRefresher intervalSeconds={8} label="Live Transactions" />
      </div>

      <div className="border rounded-xl bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead>Order ID</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Scheduled Time</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-slate-500">
                  No bookings found.
                </TableCell>
              </TableRow>
            ) : (
              bookings.map((booking: any) => (
                <TableRow key={booking.id} className="hover:bg-slate-50/50">
                  <TableCell className="font-semibold text-slate-700">
                    {booking.order_number || 'Processing'}
                  </TableCell>
                  <TableCell className="font-medium">
                    {booking.services && booking.services.length > 0
                      ? booking.services.map((s: any) => s.service_name).join(', ')
                      : 'Unknown Service'}
                  </TableCell>
                  <TableCell>
                    {booking.customer?.name || 'N/A'}
                  </TableCell>
                  <TableCell>
                    {booking.vendor?.name || 'Unassigned'}
                  </TableCell>
                  <TableCell className="text-slate-500">
                    {new Date(booking.scheduled_time).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 items-start">
                      <StatusBadge status={booking.status} />
                      {booking.final_quoted_price && (
                        <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                          Quote: ₹{booking.final_quoted_price}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {booking.customer_phone && (
                        <a 
                          href={`tel:${booking.customer_phone}`}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold py-1.5 px-3 rounded-md inline-flex items-center gap-1.5 transition-colors"
                          title="Call Customer"
                        >
                          📞 Call
                        </a>
                      )}
                      <OverrideModal 
                        bookingId={booking.id} 
                        currentStatus={booking.status} 
                        currentQuote={booking.final_quoted_price} 
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
