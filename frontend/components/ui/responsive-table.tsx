"use client";

import { ReactNode } from "react";
import { Card, CardContent } from "./card";

interface ResponsiveTableProps {
  headers: string[];
  rows: ReactNode[][];
  mobileCardRender?: (row: ReactNode[], index: number) => ReactNode;
}

export function ResponsiveTable({
  headers,
  rows,
  mobileCardRender,
}: ResponsiveTableProps) {
  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              {headers.map((header, idx) => (
                <th key={idx} className="text-left p-3 font-semibold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="border-b hover:bg-gray-50">
                {row.map((cell, cellIdx) => (
                  <td key={cellIdx} className="p-3">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {rows.map((row, rowIdx) => {
          if (mobileCardRender) {
            return <div key={rowIdx}>{mobileCardRender(row, rowIdx)}</div>;
          }
          return (
            <Card key={rowIdx}>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  {headers.map((header, headerIdx) => (
                    <div key={headerIdx}>
                      <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                        {header}
                      </div>
                      <div className="text-sm">{row[headerIdx]}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}










