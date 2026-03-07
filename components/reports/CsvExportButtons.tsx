"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/hooks/use-toast";

interface CsvExportButtonsProps {
  year: number;
}

function csvEscape(value: unknown): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CsvExportButtons({ year }: CsvExportButtonsProps) {
  const supabase = createClient();
  const [exporting, setExporting] = useState<string | null>(null);

  async function exportTimesheets() {
    setExporting("timesheets");
    try {
      const { data, error } = await (supabase.from as any)("timesheets")
        .select(`
          id, year, month, week_number, status, submitted_at, approved_at,
          employee:profiles!employee_id(display_name, email, department),
          timesheet_rows(sun, mon, tue, wed, thu, fri, sat, weekly_total,
            project:projects!project_id(code, title),
            billing_type:billing_types!billing_type_id(name)
          )
        `)
        .eq("year", year)
        .order("month")
        .order("week_number");

      if (error) throw error;

      const headers = [
        "Employee", "Email", "Department", "Year", "Month", "Week",
        "Project", "Billing Type",
        "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Weekly Total",
        "Status", "Submitted At", "Approved At",
      ];

      const rows: string[][] = [];
      for (const ts of data ?? []) {
        for (const row of ts.timesheet_rows ?? []) {
          rows.push([
            ts.employee?.display_name ?? "",
            ts.employee?.email ?? "",
            ts.employee?.department ?? "",
            String(ts.year),
            String(ts.month),
            String(ts.week_number),
            row.project?.code ?? "",
            row.billing_type?.name ?? "",
            String(row.sun ?? 0),
            String(row.mon ?? 0),
            String(row.tue ?? 0),
            String(row.wed ?? 0),
            String(row.thu ?? 0),
            String(row.fri ?? 0),
            String(row.sat ?? 0),
            String(row.weekly_total ?? 0),
            ts.status,
            ts.submitted_at ?? "",
            ts.approved_at ?? "",
          ]);
        }
      }

      downloadCsv(`timesheets_${year}.csv`, headers, rows);
      toast({ title: `Exported ${rows.length} timesheet rows`, variant: "success" });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setExporting(null);
    }
  }

  async function exportExpenses() {
    setExporting("expenses");
    try {
      const { data, error } = await (supabase.from as any)("expense_reports")
        .select(`
          id, year, week_number, week_beginning_date, destination, status, submitted_at, approved_at,
          employee:profiles!employee_id(display_name, email, department),
          expense_entries(day_index, entry_date, travel_from, travel_to,
            mileage_km, mileage_cost_claimed, lodging_amount,
            breakfast_amount, lunch_amount, dinner_amount,
            other_amount, other_note)
        `)
        .eq("year", year)
        .order("week_number");

      if (error) throw error;

      const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const headers = [
        "Employee", "Email", "Department", "Year", "Week", "Destination",
        "Day", "Date", "Travel From", "Travel To",
        "Mileage KM", "Mileage Claimed", "Lodging",
        "Breakfast", "Lunch", "Dinner", "Other", "Other Note",
        "Daily Total", "Status", "Submitted At", "Approved At",
      ];

      const rows: string[][] = [];
      for (const r of data ?? []) {
        for (const e of (r.expense_entries ?? []).sort((a: any, b: any) => a.day_index - b.day_index)) {
          const dailyTotal =
            (e.mileage_cost_claimed ?? 0) + (e.lodging_amount ?? 0) +
            (e.breakfast_amount ?? 0) + (e.lunch_amount ?? 0) +
            (e.dinner_amount ?? 0) + (e.other_amount ?? 0);
          rows.push([
            r.employee?.display_name ?? "",
            r.employee?.email ?? "",
            r.employee?.department ?? "",
            String(r.year),
            String(r.week_number),
            r.destination ?? "",
            dayNames[e.day_index] ?? String(e.day_index),
            e.entry_date ?? "",
            e.travel_from ?? "",
            e.travel_to ?? "",
            String(e.mileage_km ?? 0),
            String(e.mileage_cost_claimed ?? 0),
            String(e.lodging_amount ?? 0),
            String(e.breakfast_amount ?? 0),
            String(e.lunch_amount ?? 0),
            String(e.dinner_amount ?? 0),
            String(e.other_amount ?? 0),
            e.other_note ?? "",
            dailyTotal.toFixed(2),
            r.status,
            r.submitted_at ?? "",
            r.approved_at ?? "",
          ]);
        }
      }

      downloadCsv(`expenses_${year}.csv`, headers, rows);
      toast({ title: `Exported ${rows.length} expense entries`, variant: "success" });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-3">
      <button
        onClick={exportTimesheets}
        disabled={!!exporting}
        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
      >
        <Download className="w-4 h-4" />
        {exporting === "timesheets" ? "Exporting…" : "Export Timesheets CSV"}
      </button>
      <button
        onClick={exportExpenses}
        disabled={!!exporting}
        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
      >
        <Download className="w-4 h-4" />
        {exporting === "expenses" ? "Exporting…" : "Export Expenses CSV"}
      </button>
    </div>
  );
}
