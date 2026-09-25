import type { MaintenanceItem } from "@/modules/maintenance/service";
export default function MaintenanceStatus({ item }: { item: MaintenanceItem }) {
  return (
    <>
      <p>
        <strong>
          {item.archived
            ? "Archived"
            : !item.enabled
              ? "Template disabled"
              : item.paused
                ? "Paused"
                : item.status}
        </strong>
      </p>
      {item.next_due_usage !== null && (
        <p>
          Next due: {item.next_due_usage} {item.distance_unit} accumulated.
          {item.remainingUsage !== null &&
            ` ${Math.abs(item.remainingUsage)} ${item.distance_unit} ${item.remainingUsage < 0 ? "overdue" : "remaining"}.`}
          {item.usage !== null &&
            ` Current accumulated usage: ${item.usage} ${item.distance_unit}.`}
        </p>
      )}
      {item.next_due_date && (
        <p>
          Next due date: {item.next_due_date}.{" "}
          {item.remainingDays !== null &&
            `${Math.abs(item.remainingDays)} days ${item.remainingDays < 0 ? "overdue" : "remaining"}.`}
        </p>
      )}
      {item.observedAt && item.distance_interval !== null && (
        <p>Mileage last observed: {item.observedAt.slice(0, 10)}.</p>
      )}
      {item.missingUsage && (
        <p role="alert">
          Mileage unavailable; distance status cannot be evaluated.
        </p>
      )}
    </>
  );
}
