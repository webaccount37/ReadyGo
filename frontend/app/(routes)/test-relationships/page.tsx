"use client";

import { useState } from "react";
import { useEmployees } from "@/hooks/useEmployees";
import { useEngagements } from "@/hooks/useEngagements";
import { useReleases } from "@/hooks/useReleases";
import {
  useLinkEmployeeToEngagement,
  useUnlinkEmployeeFromEngagement,
  useLinkEmployeeToRelease,
  useUnlinkEmployeeFromRelease,
} from "@/hooks/useEmployees";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export default function RelationshipsPage() {
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [selectedEngagement, setSelectedEngagement] = useState<string>("");
  const [selectedRelease, setSelectedRelease] = useState<string>("");

  const { data: employeesData } = useEmployees({ limit: 100 });
  const { data: engagementsData } = useEngagements({ limit: 100 });
  const { data: releasesData } = useReleases({ limit: 100 });

  const linkEmployeeToEngagement = useLinkEmployeeToEngagement();
  const unlinkEmployeeFromEngagement = useUnlinkEmployeeFromEngagement();
  const linkEmployeeToRelease = useLinkEmployeeToRelease();
  const unlinkEmployeeFromRelease = useUnlinkEmployeeFromRelease();

  const handleLinkEngagement = async () => {
    if (!selectedEmployee || !selectedEngagement) {
      alert("Please select both an employee and an engagement");
      return;
    }
    // Note: This test page requires manual entry of link data
    // In production, use the employee edit page which has the full form
    alert("Please use the employee edit page to link engagements with required fields (Role, Start Date, End Date, Project Rate, Delivery Center)");
  };

  const handleUnlinkEngagement = async () => {
    if (!selectedEmployee || !selectedEngagement) {
      alert("Please select both an employee and an engagement");
      return;
    }
    try {
      await unlinkEmployeeFromEngagement.mutateAsync({
        employeeId: selectedEmployee,
        engagementId: selectedEngagement,
      });
      alert("Employee unlinked from engagement successfully!");
      setSelectedEngagement("");
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleLinkRelease = async () => {
    if (!selectedEmployee || !selectedRelease) {
      alert("Please select both an employee and a release");
      return;
    }
    // Note: This test page requires manual entry of link data
    // In production, use the employee edit page which has the full form
    alert("Please use the employee edit page to link releases with required fields (Role, Start Date, End Date, Project Rate, Delivery Center)");
  };

  const handleUnlinkRelease = async () => {
    if (!selectedEmployee || !selectedRelease) {
      alert("Please select both an employee and a release");
      return;
    }
    try {
      await unlinkEmployeeFromRelease.mutateAsync({
        employeeId: selectedEmployee,
        releaseId: selectedRelease,
      });
      alert("Employee unlinked from release successfully!");
      setSelectedRelease("");
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Manage Relationships</h1>
        <p className="text-gray-600 mt-1">
          Link employees to engagements and releases
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Employee-Engagement Relationships */}
        <Card>
          <CardHeader>
            <CardTitle>Employee ↔ Engagement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="employee-engagement">Employee</Label>
              <Select
                id="employee-engagement"
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
              >
                <option value="">Select an employee</option>
                {employeesData?.items.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.first_name} {employee.last_name} ({employee.email})
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="engagement-select">Engagement</Label>
              <Select
                id="engagement-select"
                value={selectedEngagement}
                onChange={(e) => setSelectedEngagement(e.target.value)}
              >
                <option value="">Select an engagement</option>
                {engagementsData?.items.map((engagement) => (
                  <option key={engagement.id} value={engagement.id}>
                    {engagement.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleLinkEngagement}
                disabled={
                  !selectedEmployee ||
                  !selectedEngagement ||
                  linkEmployeeToEngagement.isPending
                }
              >
                {linkEmployeeToEngagement.isPending ? "Linking..." : "Link"}
              </Button>
              <Button
                variant="destructive"
                onClick={handleUnlinkEngagement}
                disabled={
                  !selectedEmployee ||
                  !selectedEngagement ||
                  unlinkEmployeeFromEngagement.isPending
                }
              >
                {unlinkEmployeeFromEngagement.isPending ? "Unlinking..." : "Unlink"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Employee-Release Relationships */}
        <Card>
          <CardHeader>
            <CardTitle>Employee ↔ Release</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="employee-release">Employee</Label>
              <Select
                id="employee-release"
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
              >
                <option value="">Select an employee</option>
                {employeesData?.items.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.first_name} {employee.last_name} ({employee.email})
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="release-select">Release</Label>
              <Select
                id="release-select"
                value={selectedRelease}
                onChange={(e) => setSelectedRelease(e.target.value)}
              >
                <option value="">Select a release</option>
                {releasesData?.items.map((release) => (
                  <option key={release.id} value={release.id}>
                    {release.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleLinkRelease}
                disabled={
                  !selectedEmployee ||
                  !selectedRelease ||
                  linkEmployeeToRelease.isPending
                }
              >
                {linkEmployeeToRelease.isPending ? "Linking..." : "Link"}
              </Button>
              <Button
                variant="destructive"
                onClick={handleUnlinkRelease}
                disabled={
                  !selectedEmployee ||
                  !selectedRelease ||
                  unlinkEmployeeFromRelease.isPending
                }
              >
                {unlinkEmployeeFromRelease.isPending ? "Unlinking..." : "Unlink"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc list-inside space-y-2 text-gray-600">
            <li>Select an employee from the dropdown</li>
            <li>Select a project or release to link/unlink</li>
            <li>Click &quot;Link&quot; to create a relationship</li>
            <li>Click &quot;Unlink&quot; to remove a relationship</li>
            <li>You can view relationships by checking the employee details with include_relationships=true</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
