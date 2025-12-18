"use client";

import { useHealth } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function HealthPage() {
  const { data, isLoading, error } = useHealth();

  if (isLoading) {
    return <div className="text-gray-600">Loading health status...</div>;
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle>Health Check Failed</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-800">
            Error: {error instanceof Error ? error.message : String(error)}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Health Status</h1>
        <p className="text-gray-600 mt-1">System health and status information</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>System Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <strong className="text-gray-700">Status:</strong>{" "}
            <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-800">
              {data?.status}
            </span>
          </div>
          <div>
            <strong className="text-gray-700">Uptime:</strong> {data?.uptime}
          </div>
          {data?.checks && Object.keys(data.checks).length > 0 && (
            <div>
              <strong className="text-gray-700">Checks:</strong>
              <pre className="mt-2 p-4 bg-gray-50 rounded text-sm overflow-auto">
                {JSON.stringify(data.checks, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


