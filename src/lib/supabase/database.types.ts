// Mirrors the migrations. Regenerate with `npm run db:types` after schema changes.
export type Database = {
  public: {
    Tables: {
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
