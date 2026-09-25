import type {
  Template,
  Assignment,
  MaintenanceCommand,
} from "@/modules/maintenance/maintenance";
import type { MeterCommand, MeterHistory } from "@/modules/meters/meter";

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Mirrors the migrations. Regenerate with `npm run db:types` after schema changes.
export type Database = {
  public: {
    Tables: {
      maintenance_templates: {
        Row: Template;
        Insert: Omit<Template, "version" | "updated_at"> & {
          version?: number;
          updated_at?: string;
        };
        Update: Partial<Template>;
        Relationships: [];
      };
      maintenance_assignments: {
        Row: Assignment;
        Insert: Omit<Assignment, "version" | "updated_at"> & {
          version?: number;
          updated_at?: string;
        };
        Update: Partial<Assignment>;
        Relationships: [];
      };
      meters: {
        Row: {
          id: string;
          organization_id: string;
          asset_id: string;
          asset_type: string;
          meter_type: string;
          unit: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          asset_id: string;
          asset_type?: string;
          meter_type?: string;
          unit: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          asset_id?: string;
          asset_type?: string;
          meter_type?: string;
          unit?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meters_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meters_organization_id_asset_id_asset_type_fkey";
            columns: ["organization_id", "asset_id", "asset_type"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["organization_id", "id", "asset_type"];
          },
        ];
      };
      meter_entries: {
        Row: {
          id: string;
          organization_id: string;
          meter_id: string;
          kind: string;
          observed_at: string;
          physical: number;
          old_final: number | null;
          baseline_usage: number | null;
          reason: string | null;
          actor_id: string;
          recorded_at: string;
          source: string;
          request_payload: Json;
        };
        Insert: {
          id: string;
          organization_id: string;
          meter_id: string;
          kind: string;
          observed_at: string;
          physical: number;
          old_final?: number | null;
          baseline_usage?: number | null;
          reason?: string | null;
          actor_id: string;
          recorded_at?: string;
          source?: string;
          request_payload: Json;
        };
        Update: {
          id?: string;
          organization_id?: string;
          meter_id?: string;
          kind?: string;
          observed_at?: string;
          physical?: number;
          old_final?: number | null;
          baseline_usage?: number | null;
          reason?: string | null;
          actor_id?: string;
          recorded_at?: string;
          source?: string;
          request_payload?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "meter_entries_organization_id_meter_id_fkey";
            columns: ["organization_id", "meter_id"];
            isOneToOne: false;
            referencedRelation: "meters";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      meter_revisions: {
        Row: {
          id: string;
          organization_id: string;
          meter_id: string;
          entry_id: string;
          revision_number: number;
          physical: number;
          old_final: number | null;
          baseline_usage: number | null;
          voided: boolean;
          reason: string;
          actor_id: string;
          recorded_at: string;
          request_payload: Json;
        };
        Insert: {
          id: string;
          organization_id: string;
          meter_id: string;
          entry_id: string;
          revision_number: number;
          physical: number;
          old_final?: number | null;
          baseline_usage?: number | null;
          voided: boolean;
          reason: string;
          actor_id: string;
          recorded_at?: string;
          request_payload: Json;
        };
        Update: {
          id?: string;
          organization_id?: string;
          meter_id?: string;
          entry_id?: string;
          revision_number?: number;
          physical?: number;
          old_final?: number | null;
          baseline_usage?: number | null;
          voided?: boolean;
          reason?: string;
          actor_id?: string;
          recorded_at?: string;
          request_payload?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "meter_revisions_organization_id_meter_id_entry_id_fkey";
            columns: ["organization_id", "meter_id", "entry_id"];
            isOneToOne: false;
            referencedRelation: "meter_entries";
            referencedColumns: ["organization_id", "meter_id", "id"];
          },
        ];
      };

      assets: {
        Row: {
          id: string;
          organization_id: string;
          asset_type: string;
          name: string;
          status: string;
          make: string | null;
          model: string | null;
          year: number | null;
          description: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          asset_type: string;
          name: string;
          status?: string;
          make?: string | null;
          model?: string | null;
          year?: number | null;
          description?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          asset_type?: string;
          name?: string;
          status?: string;
          make?: string | null;
          model?: string | null;
          year?: number | null;
          description?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assets_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      vehicle_profiles: {
        Row: {
          asset_id: string;
          organization_id: string;
          asset_type: string;
          vin: string | null;
          plate: string | null;
          jurisdiction: string | null;
        };
        Insert: {
          asset_id: string;
          organization_id: string;
          asset_type?: string;
          vin?: string | null;
          plate?: string | null;
          jurisdiction?: string | null;
        };
        Update: {
          asset_id?: string;
          organization_id?: string;
          asset_type?: string;
          vin?: string | null;
          plate?: string | null;
          jurisdiction?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "vehicle_profiles_organization_id_asset_id_asset_type_fkey";
            columns: ["organization_id", "asset_id", "asset_type"];
            isOneToOne: true;
            referencedRelation: "assets";
            referencedColumns: ["organization_id", "id", "asset_type"];
          },
        ];
      };

      organizations: {
        Row: {
          id: string;
          name: string;
          status: string;
          timezone: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          status?: string;
          timezone?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          status?: string;
          timezone?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      memberships: {
        Row: {
          organization_id: string;
          user_id: string;
          role: string;
          status: string;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          user_id: string;
          role: string;
          status?: string;
          created_at?: string;
        };
        Update: {
          organization_id?: string;
          user_id?: string;
          role?: string;
          status?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      save_maintenance: {
        Args: {
          target_organization_id: string;
          target_asset_id: string | null;
          payload: MaintenanceCommand;
        };
        Returns: string;
      };
      maintenance_usage: {
        Args: { target_organization_id: string };
        Returns: {
          asset_id: string;
          accumulated: string;
          unit: string;
          observed_at: string;
        }[];
      };
      meter_history: {
        Args: { target_organization_id: string; target_asset_id: string };
        Returns: MeterHistory[];
      };
      record_meter_command: {
        Args: {
          target_organization_id: string;
          target_asset_id: string;
          payload: MeterCommand;
        };
        Returns: string;
      };
      save_vehicle: {
        Args: {
          target_organization_id: string;
          target_asset_id: string | null;
          vehicle_name: string;
          vehicle_status: string;
          vehicle_make: string | null;
          vehicle_model: string | null;
          vehicle_year: number | null;
          vehicle_description: string | null;
          vehicle_vin: string | null;
          vehicle_plate: string | null;
          vehicle_jurisdiction: string | null;
        };
        Returns: string;
      };
      archive_vehicle: {
        Args: { target_organization_id: string; target_asset_id: string };
        Returns: string;
      };
      create_organization: {
        Args: { organization_name: string };
        Returns: string;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
