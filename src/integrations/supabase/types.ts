export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      actividad_log: {
        Row: {
          accion: string
          canal: string
          created_at: string
          detalle: Json
          entidad: string | null
          entidad_id: string | null
          explotacion_id: string
          id: string
          user_id: string | null
        }
        Insert: {
          accion: string
          canal?: string
          created_at?: string
          detalle?: Json
          entidad?: string | null
          entidad_id?: string | null
          explotacion_id: string
          id?: string
          user_id?: string | null
        }
        Update: {
          accion?: string
          canal?: string
          created_at?: string
          detalle?: Json
          entidad?: string | null
          entidad_id?: string | null
          explotacion_id?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actividad_log_explotacion_id_fkey"
            columns: ["explotacion_id"]
            isOneToOne: false
            referencedRelation: "explotaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_action_log: {
        Row: {
          canal: string
          created_at: string
          error: string | null
          explotacion_id: string | null
          id: string
          idempotency_key: string | null
          intencion: string | null
          mensaje: string | null
          ok: boolean
          resultado: Json
          tool: string | null
          user_id: string | null
        }
        Insert: {
          canal?: string
          created_at?: string
          error?: string | null
          explotacion_id?: string | null
          id?: string
          idempotency_key?: string | null
          intencion?: string | null
          mensaje?: string | null
          ok?: boolean
          resultado?: Json
          tool?: string | null
          user_id?: string | null
        }
        Update: {
          canal?: string
          created_at?: string
          error?: string | null
          explotacion_id?: string | null
          id?: string
          idempotency_key?: string | null
          intencion?: string | null
          mensaje?: string | null
          ok?: boolean
          resultado?: Json
          tool?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_action_log_explotacion_id_fkey"
            columns: ["explotacion_id"]
            isOneToOne: false
            referencedRelation: "explotaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_feature_flags: {
        Row: {
          descripcion: string | null
          enabled: boolean
          key: string
          updated_at: string
        }
        Insert: {
          descripcion?: string | null
          enabled?: boolean
          key: string
          updated_at?: string
        }
        Update: {
          descripcion?: string | null
          enabled?: boolean
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_sessions: {
        Row: {
          canal: string
          created_at: string
          explotacion_id: string | null
          external_key: string
          id: string
          messages: Json
          pending: Json | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          canal: string
          created_at?: string
          explotacion_id?: string | null
          external_key: string
          id?: string
          messages?: Json
          pending?: Json | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          canal?: string
          created_at?: string
          explotacion_id?: string | null
          external_key?: string
          id?: string
          messages?: Json
          pending?: Json | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_sessions_explotacion_id_fkey"
            columns: ["explotacion_id"]
            isOneToOne: false
            referencedRelation: "explotaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      animales: {
        Row: {
          codigo_temporal: string | null
          created_at: string
          crotal: string
          crotal_pendiente: boolean
          especie: string
          estado: string
          estado_reproductivo: string | null
          explotacion_id: string
          fecha_alta: string
          fecha_baja: string | null
          fecha_nacimiento: string | null
          fotografia_url: string | null
          id: string
          idempotency_key: string | null
          identificador_secundario: string | null
          lote_id: string | null
          madre_id: string | null
          motivo_baja: string | null
          observaciones: string | null
          origen: string | null
          padre_id: string | null
          parcela_id: string | null
          peso_actual: number | null
          raza: string | null
          raza_id: string | null
          sexo: string
          ultimo_parto: string | null
          updated_at: string
        }
        Insert: {
          codigo_temporal?: string | null
          created_at?: string
          crotal: string
          crotal_pendiente?: boolean
          especie?: string
          estado?: string
          estado_reproductivo?: string | null
          explotacion_id: string
          fecha_alta?: string
          fecha_baja?: string | null
          fecha_nacimiento?: string | null
          fotografia_url?: string | null
          id?: string
          idempotency_key?: string | null
          identificador_secundario?: string | null
          lote_id?: string | null
          madre_id?: string | null
          motivo_baja?: string | null
          observaciones?: string | null
          origen?: string | null
          padre_id?: string | null
          parcela_id?: string | null
          peso_actual?: number | null
          raza?: string | null
          raza_id?: string | null
          sexo?: string
          ultimo_parto?: string | null
          updated_at?: string
        }
        Update: {
          codigo_temporal?: string | null
          created_at?: string
          crotal?: string
          crotal_pendiente?: boolean
          especie?: string
          estado?: string
          estado_reproductivo?: string | null
          explotacion_id?: string
          fecha_alta?: string
          fecha_baja?: string | null
          fecha_nacimiento?: string | null
          fotografia_url?: string | null
          id?: string
          idempotency_key?: string | null
          identificador_secundario?: string | null
          lote_id?: string | null
          madre_id?: string | null
          motivo_baja?: string | null
          observaciones?: string | null
          origen?: string | null
          padre_id?: string | null
          parcela_id?: string | null
          peso_actual?: number | null
          raza?: string | null
          raza_id?: string | null
          sexo?: string
          ultimo_parto?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "animales_explotacion_id_fkey"
            columns: ["explotacion_id"]
            isOneToOne: false
            referencedRelation: "explotaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "animales_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "animales_madre_id_fkey"
            columns: ["madre_id"]
            isOneToOne: false
            referencedRelation: "animales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "animales_padre_id_fkey"
            columns: ["padre_id"]
            isOneToOne: false
            referencedRelation: "animales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "animales_parcela_id_fkey"
            columns: ["parcela_id"]
            isOneToOne: false
            referencedRelation: "parcelas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "animales_raza_id_fkey"
            columns: ["raza_id"]
            isOneToOne: false
            referencedRelation: "razas"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          accion: string
          company_id: string | null
          created_at: string
          detalle: Json | null
          entidad: string | null
          entidad_id: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          accion: string
          company_id?: string | null
          created_at?: string
          detalle?: Json | null
          entidad?: string | null
          entidad_id?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          accion?: string
          company_id?: string | null
          created_at?: string
          detalle?: Json | null
          entidad?: string | null
          entidad_id?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          ciudad: string | null
          codigo_postal: string | null
          company_id: string
          created_at: string
          direccion: string | null
          email: string | null
          id: string
          nif: string | null
          nombre: string
          observaciones: string | null
          provincia: string | null
          telefono: string | null
          updated_at: string
        }
        Insert: {
          ciudad?: string | null
          codigo_postal?: string | null
          company_id: string
          created_at?: string
          direccion?: string | null
          email?: string | null
          id?: string
          nif?: string | null
          nombre: string
          observaciones?: string | null
          provincia?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          ciudad?: string | null
          codigo_postal?: string | null
          company_id?: string
          created_at?: string
          direccion?: string | null
          email?: string | null
          id?: string
          nif?: string | null
          nombre?: string
          observaciones?: string | null
          provincia?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          ciudad: string | null
          codigo_postal: string | null
          created_at: string
          current_period_end: string | null
          direccion: string | null
          email: string | null
          estado_suscripcion: Database["public"]["Enums"]["subscription_status"]
          factura_color_acento: string | null
          factura_color_primario: string | null
          factura_encabezado: string | null
          factura_logo_url: string | null
          factura_pie: string | null
          factura_template: string
          gestoria_email: string | null
          gestoria_id: string | null
          gestoria_nombre: string | null
          gestoria_telefono: string | null
          id: string
          irpf_default: number
          is_active: boolean
          iva_default: number
          nif: string | null
          nombre_comercial: string
          notas_internas: string | null
          provincia: string | null
          razon_social: string | null
          serie_facturacion: string
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          telefono: string | null
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          ciudad?: string | null
          codigo_postal?: string | null
          created_at?: string
          current_period_end?: string | null
          direccion?: string | null
          email?: string | null
          estado_suscripcion?: Database["public"]["Enums"]["subscription_status"]
          factura_color_acento?: string | null
          factura_color_primario?: string | null
          factura_encabezado?: string | null
          factura_logo_url?: string | null
          factura_pie?: string | null
          factura_template?: string
          gestoria_email?: string | null
          gestoria_id?: string | null
          gestoria_nombre?: string | null
          gestoria_telefono?: string | null
          id?: string
          irpf_default?: number
          is_active?: boolean
          iva_default?: number
          nif?: string | null
          nombre_comercial: string
          notas_internas?: string | null
          provincia?: string | null
          razon_social?: string | null
          serie_facturacion?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          telefono?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          ciudad?: string | null
          codigo_postal?: string | null
          created_at?: string
          current_period_end?: string | null
          direccion?: string | null
          email?: string | null
          estado_suscripcion?: Database["public"]["Enums"]["subscription_status"]
          factura_color_acento?: string | null
          factura_color_primario?: string | null
          factura_encabezado?: string | null
          factura_logo_url?: string | null
          factura_pie?: string | null
          factura_template?: string
          gestoria_email?: string | null
          gestoria_id?: string | null
          gestoria_nombre?: string | null
          gestoria_telefono?: string | null
          id?: string
          irpf_default?: number
          is_active?: boolean
          iva_default?: number
          nif?: string | null
          nombre_comercial?: string
          notas_internas?: string | null
          provincia?: string | null
          razon_social?: string | null
          serie_facturacion?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          telefono?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_gestoria_id_fkey"
            columns: ["gestoria_id"]
            isOneToOne: false
            referencedRelation: "gestorias"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos: {
        Row: {
          animal_id: string | null
          archivo_path: string | null
          bucket: string
          categoria: string
          created_at: string
          created_by: string | null
          evento_id: string | null
          explotacion_id: string
          fecha: string
          id: string
          nombre: string
          observaciones: string | null
          updated_at: string
        }
        Insert: {
          animal_id?: string | null
          archivo_path?: string | null
          bucket?: string
          categoria?: string
          created_at?: string
          created_by?: string | null
          evento_id?: string | null
          explotacion_id: string
          fecha?: string
          id?: string
          nombre: string
          observaciones?: string | null
          updated_at?: string
        }
        Update: {
          animal_id?: string | null
          archivo_path?: string | null
          bucket?: string
          categoria?: string
          created_at?: string
          created_by?: string | null
          evento_id?: string | null
          explotacion_id?: string
          fecha?: string
          id?: string
          nombre?: string
          observaciones?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "animales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos_animales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_explotacion_id_fkey"
            columns: ["explotacion_id"]
            isOneToOne: false
            referencedRelation: "explotaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      especies: {
        Row: {
          activa: boolean
          codigo: string
          created_at: string
          dias_gestacion: number
          nombre: string
          orden: number
        }
        Insert: {
          activa?: boolean
          codigo: string
          created_at?: string
          dias_gestacion?: number
          nombre: string
          orden?: number
        }
        Update: {
          activa?: boolean
          codigo?: string
          created_at?: string
          dias_gestacion?: number
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      eventos_animales: {
        Row: {
          animal_id: string | null
          created_at: string
          created_by: string | null
          descripcion: string | null
          documento_id: string | null
          estado: string
          explotacion_id: string
          fecha: string
          id: string
          idempotency_key: string | null
          metadata: Json
          tipo_evento: string
        }
        Insert: {
          animal_id?: string | null
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          documento_id?: string | null
          estado?: string
          explotacion_id: string
          fecha?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          tipo_evento: string
        }
        Update: {
          animal_id?: string | null
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          documento_id?: string | null
          estado?: string
          explotacion_id?: string
          fecha?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          tipo_evento?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventos_animales_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "animales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_animales_explotacion_id_fkey"
            columns: ["explotacion_id"]
            isOneToOne: false
            referencedRelation: "explotaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          animal_id: string | null
          archivo_path: string | null
          base_imponible: number
          categoria: string
          company_id: string | null
          concepto: string
          created_at: string
          estado: Database["public"]["Enums"]["expense_status"]
          explotacion_id: string | null
          fecha: string
          finca_id: string | null
          id: string
          idempotency_key: string | null
          iva_importe: number
          iva_porcentaje: number
          lote_id: string | null
          observaciones: string | null
          origen: string
          proveedor: string | null
          total: number
          updated_at: string
        }
        Insert: {
          animal_id?: string | null
          archivo_path?: string | null
          base_imponible?: number
          categoria?: string
          company_id?: string | null
          concepto: string
          created_at?: string
          estado?: Database["public"]["Enums"]["expense_status"]
          explotacion_id?: string | null
          fecha?: string
          finca_id?: string | null
          id?: string
          idempotency_key?: string | null
          iva_importe?: number
          iva_porcentaje?: number
          lote_id?: string | null
          observaciones?: string | null
          origen?: string
          proveedor?: string | null
          total?: number
          updated_at?: string
        }
        Update: {
          animal_id?: string | null
          archivo_path?: string | null
          base_imponible?: number
          categoria?: string
          company_id?: string | null
          concepto?: string
          created_at?: string
          estado?: Database["public"]["Enums"]["expense_status"]
          explotacion_id?: string | null
          fecha?: string
          finca_id?: string | null
          id?: string
          idempotency_key?: string | null
          iva_importe?: number
          iva_porcentaje?: number
          lote_id?: string | null
          observaciones?: string | null
          origen?: string
          proveedor?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "animales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_explotacion_id_fkey"
            columns: ["explotacion_id"]
            isOneToOne: false
            referencedRelation: "explotaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_finca_id_fkey"
            columns: ["finca_id"]
            isOneToOne: false
            referencedRelation: "fincas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      explotacion_members: {
        Row: {
          created_at: string
          explotacion_id: string
          id: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          explotacion_id: string
          id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          explotacion_id?: string
          id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "explotacion_members_explotacion_id_fkey"
            columns: ["explotacion_id"]
            isOneToOne: false
            referencedRelation: "explotaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      explotaciones: {
        Row: {
          codigo_rega: string | null
          created_at: string
          dias_gestacion: number | null
          especie_principal: string
          id: string
          is_demo: boolean
          lote_crias_id: string | null
          municipio: string | null
          nombre: string
          numero_animales_estimado: number | null
          onboarding_completed_at: string | null
          pilot_notes: string | null
          pilot_started_at: string | null
          pilot_status: string
          provincia: string | null
          superficie_total: number | null
          tareas_automaticas: boolean
          tipo_ganaderia: string
          updated_at: string
          user_id: string
          whatsapp_number: string | null
        }
        Insert: {
          codigo_rega?: string | null
          created_at?: string
          dias_gestacion?: number | null
          especie_principal?: string
          id?: string
          is_demo?: boolean
          lote_crias_id?: string | null
          municipio?: string | null
          nombre: string
          numero_animales_estimado?: number | null
          onboarding_completed_at?: string | null
          pilot_notes?: string | null
          pilot_started_at?: string | null
          pilot_status?: string
          provincia?: string | null
          superficie_total?: number | null
          tareas_automaticas?: boolean
          tipo_ganaderia?: string
          updated_at?: string
          user_id: string
          whatsapp_number?: string | null
        }
        Update: {
          codigo_rega?: string | null
          created_at?: string
          dias_gestacion?: number | null
          especie_principal?: string
          id?: string
          is_demo?: boolean
          lote_crias_id?: string | null
          municipio?: string | null
          nombre?: string
          numero_animales_estimado?: number | null
          onboarding_completed_at?: string | null
          pilot_notes?: string | null
          pilot_started_at?: string | null
          pilot_status?: string
          provincia?: string | null
          superficie_total?: number | null
          tareas_automaticas?: boolean
          tipo_ganaderia?: string
          updated_at?: string
          user_id?: string
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "explotaciones_lote_crias_id_fkey"
            columns: ["lote_crias_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          canal: string
          contexto: Json
          created_at: string
          estado: string
          explotacion_id: string | null
          id: string
          mensaje: string
          user_id: string | null
          valoracion: number | null
        }
        Insert: {
          canal?: string
          contexto?: Json
          created_at?: string
          estado?: string
          explotacion_id?: string | null
          id?: string
          mensaje: string
          user_id?: string | null
          valoracion?: number | null
        }
        Update: {
          canal?: string
          contexto?: Json
          created_at?: string
          estado?: string
          explotacion_id?: string | null
          id?: string
          mensaje?: string
          user_id?: string | null
          valoracion?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_explotacion_id_fkey"
            columns: ["explotacion_id"]
            isOneToOne: false
            referencedRelation: "explotaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      fincas: {
        Row: {
          created_at: string
          explotacion_id: string
          id: string
          nombre: string
          observaciones: string | null
          referencia: string | null
          superficie: number | null
          ubicacion: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          explotacion_id: string
          id?: string
          nombre: string
          observaciones?: string | null
          referencia?: string | null
          superficie?: number | null
          ubicacion?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          explotacion_id?: string
          id?: string
          nombre?: string
          observaciones?: string | null
          referencia?: string | null
          superficie?: number | null
          ubicacion?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fincas_explotacion_id_fkey"
            columns: ["explotacion_id"]
            isOneToOne: false
            referencedRelation: "explotaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      gestoria_empresa_links: {
        Row: {
          company_id: string
          created_at: string
          decided_at: string | null
          gestoria_id: string
          id: string
          notas: string | null
          requested_at: string
          requested_by: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          decided_at?: string | null
          gestoria_id: string
          id?: string
          notas?: string | null
          requested_at?: string
          requested_by?: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          decided_at?: string | null
          gestoria_id?: string
          id?: string
          notas?: string | null
          requested_at?: string
          requested_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gestoria_empresa_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gestoria_empresa_links_gestoria_id_fkey"
            columns: ["gestoria_id"]
            isOneToOne: false
            referencedRelation: "gestorias"
            referencedColumns: ["id"]
          },
        ]
      }
      gestorias: {
        Row: {
          ciudad: string | null
          codigo_postal: string | null
          created_at: string
          current_period_end: string | null
          direccion: string | null
          email: string
          id: string
          is_active: boolean
          max_empresas: number
          nif: string | null
          nombre: string
          notas: string | null
          provincia: string | null
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          telefono: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ciudad?: string | null
          codigo_postal?: string | null
          created_at?: string
          current_period_end?: string | null
          direccion?: string | null
          email: string
          id?: string
          is_active?: boolean
          max_empresas?: number
          nif?: string | null
          nombre: string
          notas?: string | null
          provincia?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          telefono?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ciudad?: string | null
          codigo_postal?: string | null
          created_at?: string
          current_period_end?: string | null
          direccion?: string | null
          email?: string
          id?: string
          is_active?: boolean
          max_empresas?: number
          nif?: string | null
          nombre?: string
          notas?: string | null
          provincia?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          telefono?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ingresos: {
        Row: {
          animal_id: string | null
          categoria: string
          cliente: string | null
          concepto: string
          created_at: string
          created_by: string | null
          explotacion_id: string
          fecha: string
          id: string
          idempotency_key: string | null
          importe: number
          lote_id: string | null
          observaciones: string | null
          updated_at: string
        }
        Insert: {
          animal_id?: string | null
          categoria?: string
          cliente?: string | null
          concepto: string
          created_at?: string
          created_by?: string | null
          explotacion_id: string
          fecha?: string
          id?: string
          idempotency_key?: string | null
          importe?: number
          lote_id?: string | null
          observaciones?: string | null
          updated_at?: string
        }
        Update: {
          animal_id?: string | null
          categoria?: string
          cliente?: string | null
          concepto?: string
          created_at?: string
          created_by?: string | null
          explotacion_id?: string
          fecha?: string
          id?: string
          idempotency_key?: string | null
          importe?: number
          lote_id?: string | null
          observaciones?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingresos_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "animales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingresos_explotacion_id_fkey"
            columns: ["explotacion_id"]
            isOneToOne: false
            referencedRelation: "explotaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingresos_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          cantidad: number
          company_id: string
          concepto: string
          created_at: string
          descuento_porcentaje: number
          id: string
          importe: number
          invoice_id: string
          iva_importe: number
          iva_porcentaje: number
          orden: number
          precio_unitario: number
          total: number
          updated_at: string
        }
        Insert: {
          cantidad?: number
          company_id: string
          concepto: string
          created_at?: string
          descuento_porcentaje?: number
          id?: string
          importe?: number
          invoice_id: string
          iva_importe?: number
          iva_porcentaje?: number
          orden?: number
          precio_unitario?: number
          total?: number
          updated_at?: string
        }
        Update: {
          cantidad?: number
          company_id?: string
          concepto?: string
          created_at?: string
          descuento_porcentaje?: number
          id?: string
          importe?: number
          invoice_id?: string
          iva_importe?: number
          iva_porcentaje?: number
          orden?: number
          precio_unitario?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          base_imponible: number
          client_id: string | null
          company_id: string
          concepto: string
          created_at: string
          estado: Database["public"]["Enums"]["invoice_status"]
          factura_rectificada_id: string | null
          fecha: string
          fecha_cobro: string | null
          fecha_operacion: string | null
          fecha_vencimiento: string | null
          id: string
          irpf_importe: number
          irpf_porcentaje: number
          iva_importe: number
          iva_porcentaje: number
          mencion_legal: string | null
          metodo_pago: Database["public"]["Enums"]["payment_method"] | null
          motivo_rectificacion: string | null
          notas: string | null
          numero: string
          pdf_path: string | null
          serie: string
          tipo: Database["public"]["Enums"]["invoice_tipo"]
          total: number
          updated_at: string
        }
        Insert: {
          base_imponible?: number
          client_id?: string | null
          company_id: string
          concepto: string
          created_at?: string
          estado?: Database["public"]["Enums"]["invoice_status"]
          factura_rectificada_id?: string | null
          fecha?: string
          fecha_cobro?: string | null
          fecha_operacion?: string | null
          fecha_vencimiento?: string | null
          id?: string
          irpf_importe?: number
          irpf_porcentaje?: number
          iva_importe?: number
          iva_porcentaje?: number
          mencion_legal?: string | null
          metodo_pago?: Database["public"]["Enums"]["payment_method"] | null
          motivo_rectificacion?: string | null
          notas?: string | null
          numero: string
          pdf_path?: string | null
          serie?: string
          tipo?: Database["public"]["Enums"]["invoice_tipo"]
          total?: number
          updated_at?: string
        }
        Update: {
          base_imponible?: number
          client_id?: string | null
          company_id?: string
          concepto?: string
          created_at?: string
          estado?: Database["public"]["Enums"]["invoice_status"]
          factura_rectificada_id?: string | null
          fecha?: string
          fecha_cobro?: string | null
          fecha_operacion?: string | null
          fecha_vencimiento?: string | null
          id?: string
          irpf_importe?: number
          irpf_porcentaje?: number
          iva_importe?: number
          iva_porcentaje?: number
          mencion_legal?: string | null
          metodo_pago?: Database["public"]["Enums"]["payment_method"] | null
          motivo_rectificacion?: string | null
          notas?: string | null
          numero?: string
          pdf_path?: string | null
          serie?: string
          tipo?: Database["public"]["Enums"]["invoice_tipo"]
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      lotes: {
        Row: {
          created_at: string
          descripcion: string | null
          estado: string
          explotacion_id: string
          finca_id: string | null
          id: string
          nombre: string
          parcela_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          descripcion?: string | null
          estado?: string
          explotacion_id: string
          finca_id?: string | null
          id?: string
          nombre: string
          parcela_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          descripcion?: string | null
          estado?: string
          explotacion_id?: string
          finca_id?: string | null
          id?: string
          nombre?: string
          parcela_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lotes_explotacion_id_fkey"
            columns: ["explotacion_id"]
            isOneToOne: false
            referencedRelation: "explotaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_finca_id_fkey"
            columns: ["finca_id"]
            isOneToOne: false
            referencedRelation: "fincas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_parcela_id_fkey"
            columns: ["parcela_id"]
            isOneToOne: false
            referencedRelation: "parcelas"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_closures: {
        Row: {
          anio: number
          company_id: string
          created_at: string
          enviado_gestoria_en: string | null
          id: string
          mes: number
          mes_listo: boolean
          notas: string | null
          trimestre_listo: boolean
          updated_at: string
        }
        Insert: {
          anio: number
          company_id: string
          created_at?: string
          enviado_gestoria_en?: string | null
          id?: string
          mes: number
          mes_listo?: boolean
          notas?: string | null
          trimestre_listo?: boolean
          updated_at?: string
        }
        Update: {
          anio?: number
          company_id?: string
          created_at?: string
          enviado_gestoria_en?: string | null
          id?: string
          mes?: number
          mes_listo?: boolean
          notas?: string | null
          trimestre_listo?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_closures_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      parcelas: {
        Row: {
          created_at: string
          estado: string
          explotacion_id: string
          finca_id: string | null
          id: string
          nombre: string
          observaciones: string | null
          referencia_sigpac: string | null
          superficie: number | null
          updated_at: string
          uso: string | null
        }
        Insert: {
          created_at?: string
          estado?: string
          explotacion_id: string
          finca_id?: string | null
          id?: string
          nombre: string
          observaciones?: string | null
          referencia_sigpac?: string | null
          superficie?: number | null
          updated_at?: string
          uso?: string | null
        }
        Update: {
          created_at?: string
          estado?: string
          explotacion_id?: string
          finca_id?: string | null
          id?: string
          nombre?: string
          observaciones?: string | null
          referencia_sigpac?: string | null
          superficie?: number | null
          updated_at?: string
          uso?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parcelas_explotacion_id_fkey"
            columns: ["explotacion_id"]
            isOneToOne: false
            referencedRelation: "explotaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcelas_finca_id_fkey"
            columns: ["finca_id"]
            isOneToOne: false
            referencedRelation: "fincas"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_registrations: {
        Row: {
          company_id: string | null
          completed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          nif: string | null
          nombre_comercial: string
          password_hash: string
          raw_payload: Json | null
          razon_social: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          telefono: string | null
          updated_at: string
          user_id: string | null
          whatsapp_number: string | null
        }
        Insert: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          nif?: string | null
          nombre_comercial: string
          password_hash: string
          raw_payload?: Json | null
          razon_social?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          telefono?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          nif?: string | null
          nombre_comercial?: string
          password_hash?: string
          raw_payload?: Json | null
          razon_social?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          telefono?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      product_events: {
        Row: {
          canal: string
          created_at: string
          evento: string
          explotacion_id: string | null
          id: string
          props: Json
          user_id: string | null
        }
        Insert: {
          canal?: string
          created_at?: string
          evento: string
          explotacion_id?: string | null
          id?: string
          props?: Json
          user_id?: string | null
        }
        Update: {
          canal?: string
          created_at?: string
          evento?: string
          explotacion_id?: string | null
          id?: string
          props?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_events_explotacion_id_fkey"
            columns: ["explotacion_id"]
            isOneToOne: false
            referencedRelation: "explotaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          current_company_id: string | null
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_company_id?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_company_id?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_current_company_id_fkey"
            columns: ["current_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      razas: {
        Row: {
          activa: boolean
          autoctona: boolean
          categoria: string | null
          created_at: string
          especie_codigo: string
          id: string
          nombre: string
        }
        Insert: {
          activa?: boolean
          autoctona?: boolean
          categoria?: string | null
          created_at?: string
          especie_codigo: string
          id?: string
          nombre: string
        }
        Update: {
          activa?: boolean
          autoctona?: boolean
          categoria?: string | null
          created_at?: string
          especie_codigo?: string
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "razas_especie_codigo_fkey"
            columns: ["especie_codigo"]
            isOneToOne: false
            referencedRelation: "especies"
            referencedColumns: ["codigo"]
          },
        ]
      }
      stripe_events: {
        Row: {
          id: string
          payload: Json | null
          processed_at: string
          type: string
        }
        Insert: {
          id: string
          payload?: Json | null
          processed_at?: string
          type: string
        }
        Update: {
          id?: string
          payload?: Json | null
          processed_at?: string
          type?: string
        }
        Relationships: []
      }
      tareas: {
        Row: {
          animal_id: string | null
          created_at: string
          created_by: string | null
          descripcion: string | null
          estado: string
          explotacion_id: string
          fecha_limite: string | null
          id: string
          lote_id: string | null
          prioridad: string
          titulo: string
          updated_at: string
        }
        Insert: {
          animal_id?: string | null
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          estado?: string
          explotacion_id: string
          fecha_limite?: string | null
          id?: string
          lote_id?: string | null
          prioridad?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          animal_id?: string | null
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          estado?: string
          explotacion_id?: string
          fecha_limite?: string | null
          id?: string
          lote_id?: string | null
          prioridad?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tareas_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "animales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_explotacion_id_fkey"
            columns: ["explotacion_id"]
            isOneToOne: false
            referencedRelation: "explotaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_messages: {
        Row: {
          adjunto_path: string | null
          comando: string | null
          company_id: string | null
          created_at: string
          estado: Database["public"]["Enums"]["message_status"]
          id: string
          pending_action: Json | null
          recibido_en: string
          remitente: string
          resultado: Json | null
          texto: string | null
          tipo: Database["public"]["Enums"]["message_kind"]
          to_number: string | null
          wa_message_id: string | null
        }
        Insert: {
          adjunto_path?: string | null
          comando?: string | null
          company_id?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["message_status"]
          id?: string
          pending_action?: Json | null
          recibido_en?: string
          remitente: string
          resultado?: Json | null
          texto?: string | null
          tipo?: Database["public"]["Enums"]["message_kind"]
          to_number?: string | null
          wa_message_id?: string | null
        }
        Update: {
          adjunto_path?: string | null
          comando?: string | null
          company_id?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["message_status"]
          id?: string
          pending_action?: Json | null
          recibido_en?: string
          remitente?: string
          resultado?: Json | null
          texto?: string | null
          tipo?: Database["public"]["Enums"]["message_kind"]
          to_number?: string | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      asignar_crotal: {
        Args: { _animal_id: string; _crotal: string }
        Returns: Json
      }
      decide_gestoria_link: {
        Args: { _decision: string; _link_id: string }
        Returns: undefined
      }
      gestoria_invite_company: {
        Args: { _company_email: string }
        Returns: string
      }
      gestoria_listar_empresas: {
        Args: never
        Returns: {
          company_id: string
          decided_at: string
          email: string
          estado_suscripcion: string
          is_active: boolean
          link_id: string
          nif: string
          nombre_comercial: string
          requested_at: string
          requested_by: string
          status: string
          whatsapp_number: string
        }[]
      }
      gestoria_manages_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      mover_animales_lote: {
        Args: {
          _animal_ids: string[]
          _explotacion_id: string
          _fecha?: string
          _idempotency_key?: string
          _lote_id: string
          _origen?: string
        }
        Returns: Json
      }
      pilot_metrics: {
        Args: never
        Returns: {
          acciones_ia_7d: number
          animales: number
          eventos_7d: number
          explotacion_id: string
          mensajes_wa_7d: number
          nombre: string
          pilot_status: string
          ultimo_uso: string
        }[]
      }
      purge_expired_registrations: { Args: never; Returns: number }
      registrar_evento_animal: {
        Args: {
          _animal_id?: string
          _descripcion?: string
          _explotacion_id: string
          _fecha: string
          _idempotency_key?: string
          _importe?: number
          _lote_id?: string
          _metadata?: Json
          _origen?: string
          _peso?: number
          _tipo_evento: string
        }
        Returns: Json
      }
      registrar_parto: {
        Args: {
          _crias?: Json
          _dificultad?: string
          _fecha: string
          _idempotency_key?: string
          _madre_id: string
          _observaciones?: string
          _origen?: string
          _padre_id?: string
        }
        Returns: Json
      }
      request_gestoria_link: {
        Args: { _company_id: string; _gestoria_email: string }
        Returns: string
      }
      signup_create_company: {
        Args: {
          _email?: string
          _nif?: string
          _nombre_comercial: string
          _razon_social?: string
          _telefono?: string
          _whatsapp_number?: string
        }
        Returns: string
      }
      signup_create_gestoria: {
        Args: {
          _ciudad?: string
          _codigo_postal?: string
          _direccion?: string
          _email: string
          _nif?: string
          _nombre: string
          _provincia?: string
          _telefono?: string
        }
        Returns: string
      }
      user_has_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      user_in_explotacion: {
        Args: { _explotacion_id: string; _user_id: string }
        Returns: boolean
      }
      user_owns_explotacion: {
        Args: { _explotacion_id: string; _user_id: string }
        Returns: boolean
      }
      user_owns_gestoria: {
        Args: { _gestoria_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "superadmin" | "gestor" | "cliente_empresa" | "gestoria"
      expense_status: "pendiente" | "revisado" | "rechazado"
      invoice_status: "borrador" | "enviada" | "cobrada" | "vencida"
      invoice_tipo: "ordinaria" | "rectificativa"
      message_kind: "texto" | "imagen" | "documento" | "audio" | "comando"
      message_status: "pendiente" | "procesado" | "error"
      payment_method:
        | "transferencia"
        | "efectivo"
        | "bizum"
        | "tarjeta"
        | "otro"
      subscription_status: "activa" | "pausada" | "cancelada" | "prueba"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["superadmin", "gestor", "cliente_empresa", "gestoria"],
      expense_status: ["pendiente", "revisado", "rechazado"],
      invoice_status: ["borrador", "enviada", "cobrada", "vencida"],
      invoice_tipo: ["ordinaria", "rectificativa"],
      message_kind: ["texto", "imagen", "documento", "audio", "comando"],
      message_status: ["pendiente", "procesado", "error"],
      payment_method: ["transferencia", "efectivo", "bizum", "tarjeta", "otro"],
      subscription_status: ["activa", "pausada", "cancelada", "prueba"],
    },
  },
} as const
