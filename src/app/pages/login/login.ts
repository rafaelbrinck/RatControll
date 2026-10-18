import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Auth } from '../../core/auth/auth';
import { supabase } from '../../core/data/supabase';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styleUrl: './login.css',
  templateUrl: './login.html',
})
export class Login {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  registrar = false;
  loading = false;
  usuario = {
    nome: '',
    username: '',
    password: '',
    validaPassword: '',
  };

  async logar(): Promise<void> {
    if (!this.usuario.username || !this.usuario.password) {
      alert('Informe e-mail e senha para continuar.');
      return;
    }

    this.loading = true;

    try {
      const ok = await this.auth.logar({
        username: this.usuario.username,
        password: this.usuario.password,
      });

      if (!ok) {
        alert('E-mail ou senha inválidos.');
        return;
      }

      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      await this.router.navigateByUrl(returnUrl?.startsWith('/') ? returnUrl : '/dashboard');
    } catch {
      alert('Erro ao fazer login. Tente novamente.');
    } finally {
      this.loading = false;
    }
  }

  async inserir(): Promise<void> {
    if (!this.usuario.nome || !this.usuario.username || !this.usuario.password) {
      alert('Preencha nome, e-mail e senha.');
      return;
    }

    if (this.usuario.password !== this.usuario.validaPassword) {
      alert('As senhas não conferem.');
      return;
    }

    this.loading = true;

    try {
      const { error } = await supabase.auth.signUp({
        email: this.usuario.username,
        password: this.usuario.password,
        options: {
          data: {
            nome: this.usuario.nome,
          },
        },
      });

      if (error) {
        throw error;
      }

      alert('Cadastro realizado! Verifique seu e-mail para confirmar a conta.');
      this.registrar = false;
      this.usuario = {
        nome: '',
        username: '',
        password: '',
        validaPassword: '',
      };
    } catch (error) {
      console.error('Erro ao cadastrar:', error);
      alert('Não foi possível realizar o cadastro.');
    } finally {
      this.loading = false;
    }
  }
}
