import { Injectable, inject } from '@angular/core';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { BehaviorSubject } from 'rxjs';
import { supabase } from '../data/supabase';
import { CaixasService } from '../data/caixas';

export interface User {
  username: string;
  password: string;
  nome?: string;
  validaPassword?: string;
}

export interface UserLogado {
  id: string;
  username?: string;
  nome?: string;
  logo?: string | null;
  qrcode_pix?: string | null;
}

@Injectable({ providedIn: 'root' })
export class Auth {
  public idUserLogadoSubject = new BehaviorSubject<string>('');
  public idUserLogado$ = this.idUserLogadoSubject.asObservable();

  private userSubject = new BehaviorSubject<UserLogado | undefined>(undefined);
  public user$ = this.userSubject.asObservable();

  private readonly caixasService = inject(CaixasService);
  private restaurandoSessao: Promise<boolean> | null = null;

  getUserLogado(): string {
    return this.idUserLogadoSubject.getValue();
  }

  setUserLogado(id: string): void {
    if (this.getUserLogado() !== id) {
      this.caixasService.limpar();
    }
    this.idUserLogadoSubject.next(id);
  }

  async getUser(): Promise<UserLogado | undefined> {
    const usuarioAtual = this.userSubject.getValue();
    if (usuarioAtual && usuarioAtual.id === this.getUserLogado()) {
      return usuarioAtual;
    }

    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        return undefined;
      }

      const usuario = this.mapearUsuario(data.user);
      this.setUserLogado(usuario.id);
      this.userSubject.next(usuario);
      return usuario;
    } catch (error) {
      console.error('Erro ao buscar usuário autenticado:', error);
      return undefined;
    }
  }

  async recarregarUsuario(): Promise<void> {
    this.userSubject.next(await this.getUser());
  }

  async logar(user: User): Promise<boolean> {
    if (!user?.username || !user?.password) {
      return false;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: user.username,
        password: user.password,
      });

      if (error || !data.user) {
        return false;
      }

      this.setUserLogado(data.user.id);
      this.userSubject.next(this.mapearUsuario(data.user));
      return true;
    } catch {
      return false;
    }
  }

  async restaurarSessao(): Promise<boolean> {
    if (this.restaurandoSessao) {
      return this.restaurandoSessao;
    }

    const restauracao = this.restaurarSessaoInterno();
    this.restaurandoSessao = restauracao;

    try {
      return await restauracao;
    } finally {
      if (this.restaurandoSessao === restauracao) {
        this.restaurandoSessao = null;
      }
    }
  }

  async logout(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new Error(error.message);
    }

    this.caixasService.limpar();
    this.setUserLogado('');
    this.userSubject.next(undefined);
  }

  async insertVendas(_id: string): Promise<void> {
    return;
  }

  async hasActiveSession(): Promise<boolean> {
    return this.restaurarSessao();
  }

  private async restaurarSessaoInterno(): Promise<boolean> {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error('Erro ao restaurar sessão:', error.message);
        this.userSubject.next(undefined);
        this.setUserLogado('');
        return false;
      }

      const session = data?.session;
      if (!session?.user) {
        this.userSubject.next(undefined);
        this.setUserLogado('');
        return false;
      }

      const usuario = this.mapearUsuario(session.user);
      this.setUserLogado(usuario.id);
      this.userSubject.next(usuario);
      return true;
    } catch (error) {
      console.error('Erro inesperado ao restaurar sessão:', error);
      this.userSubject.next(undefined);
      this.setUserLogado('');
      return false;
    }
  }

  private mapearUsuario(user: SupabaseUser): UserLogado {
    const metadata = user.user_metadata ?? {};
    const stringValue = (value: unknown): string | undefined =>
      typeof value === 'string' ? value : undefined;

    return {
      id: user.id,
      username: user.email,
      nome: stringValue(metadata['nome']) ?? stringValue(metadata['full_name']),
      logo: stringValue(metadata['logo']) ?? null,
      qrcode_pix: stringValue(metadata['qrcode_pix']) ?? null,
    };
  }
}
