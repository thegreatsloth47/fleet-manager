// Mirrors the migrations. Regenerate with `npm run db:types` after schema changes.
export type Database = {
  public: {
    Tables: {
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
      create_organization: {
        Args: { organization_name: string };
        Returns: string;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
