"use client";

import { useState } from "react";
import { useEmployees } from "@/hooks/useEmployees";
import { useOpportunities } from "@/hooks/useOpportunities";
import { useEngagements } from "@/hooks/useEngagements";
import {
  useLinkEmployeeToOpportunity,
  useUnlinkEmployeeFromOpportunity,
  useLinkEmployeeToEngagement,
  useUnlinkEmployeeFromEngagement,
} from "@/hooks/useEmployees";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export default function RelationshipsPage() {
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [selectedOpportunity, setSelectedOpportunity] = useState<string>("");
  const [selectedEngagement, setSelectedEngagement] = useState<string>("");

  const { data: employeesData } = useEmployees({ limit: 100 });
  const { data: opportunitiesData } = useOpportunities({ limit: 100 });
  const { data: engagementsData } = useEngagements({ limit: 100 });

  const linkEmployeeToOpportunity = useLinkEmployeeToOpportunity();
  const unlinkEmployeeFromOpportunity = useUnlinkEmployeeFromOpportunity();
  const linkEmployeeToEngagement = useLinkEmployeeToEngagement();
  const unlinkEmployeeFromEngagement = useUnlinkEmployeeFromEngagement();

  const handleLinkOpportunity = async () => {
    if (!selectedEmployee || !selectedOpportunity) {
      alert("Please select both an employee and an opportunity");
      return;
    }
    // Note: This test page requires manual entry of link data
    // In production, use the employee edit page which has the full form
    alert("Please use the employee edit page to link opportunities with required fields (Role, Start Date, End Date, Project Rate, Delivery Center)");
  };

  const handleUnlinkOpportunity = async () => {
    if (!selectedEmployee || !selectedOpportunity) {
      alert("Please select both an employee and an opportunity");
      return;
    }
    try {
      await unlinkEmployeeFromOpportunity.mutateAsync({
        employeeId: selectedEmployee,
        opportunityId: selectedOpportunity,
      });
      alert("Employee unlinked from opportunity successfully!");
      setSelectedOpportunity("");
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Manage Relationships</h1>
        <p className="text-gray-600 mt-1">
          Link employees to opportunities and engagements
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Employee-Opportunity Relationships */}
        <Card>
          <CardHeader>
            <CardTitle>Employee ↔ Opportunity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="employee-opportunity">Employee</Label>
              <Select
                id="employee-opportunity"
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
              <Label htmlFor="opportunity-select">Opportunity</Label>
              <Select
                id="opportunity-select"
                value={selectedOpportunity}
                onChange={(e) => setSelectedOpportunity(e.target.value)}
              >
                <option value="">Select an opportunity</option>
                {opportunitiesData?.items.map((opportunity) => (
                  <option key={opportunity.id} value={opportunity.id}>
                    {opportunity.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleLinkOpportunity}
                disabled={
                  !selectedEmployee ||
                  !selectedOpportunity ||
                  linkEmployeeToOpportunity.isPending
                }
              >
                {linkEmployeeToOpportunity.isPending ? "Linking..." : "Link"}
              </Button>
              <Button
                variant="destructive"
                onClick={handleUnlinkOpportunity}
                disabled={
                  !selectedEmployee ||
                  !selectedOpportunity ||
                  unlinkEmployeeFromOpportunity.isPending
                }
              >
                {unlinkEmployeeFromOpportunity.isPending ? "Unlinking..." : "Unlink"}
              </Button>
            </div>
          </CardContent>
        </Card>

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
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc list-inside space-y-2 text-gray-600">
            <li>Select an employee from the dropdown</li>
            <li>Select a project or engagement to link/unlink</li>
            <li>Click &quot;Link&quot; to create a relationship</li>
            <li>Click &quot;Unlink&quot; to remove a relationship</li>
            <li>You can view relationships by checking the employee details with include_relationships=true</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
