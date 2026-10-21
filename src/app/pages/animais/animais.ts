import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../core/auth/auth';
import { Animal, AnimaisService } from '../../core/data/animais';
import { AppNavigation } from '../../shared/navigation/app-navigation';

@Component({
  selector: 'app-animais',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppNavigation],
  templateUrl: './animais.html',
})
export class AnimaisPage {
  private readonly auth = inject(Auth);
  private readonly animaisService = inject(AnimaisService);
  private readonly router = inject(Router);

  readonly animais = this.animaisService.animais;
  readonly carregando = signal(true);
  readonly salvando = signal(false);
  readonly modalAberto = signal(false);
  readonly animalEditando = signal<Animal | undefined>(undefined);
  readonly nome = signal('');
  readonly busca = signal('');
  readonly mensagem = signal('');
  readonly erro = signal('');

  get animaisFiltrados(): Animal[] {
    const termo = this.busca().trim().toLocaleLowerCase('pt-BR');
    return this.animais().filter((animal) => animal.nome.toLocaleLowerCase('pt-BR').includes(termo));
  }

  constructor() {
    void this.carregar();
  }

  async carregar(): Promise<void> {
    if (!this.auth.getUserLogado()) {
      await this.auth.restaurarSessao();
    }
    const userId = this.auth.getUserLogado();
    if (!userId) {
      this.erro.set('Sua sessão expirou. Entre novamente para acessar os animais.');
      this.carregando.set(false);
      return;
    }

    this.carregando.set(true);
    this.erro.set('');
    try {
      await this.animaisService.listar(userId, true);
    } catch (error) {
      this.erro.set(error instanceof Error ? error.message : 'Não foi possível carregar os animais.');
    } finally {
      this.carregando.set(false);
    }
  }

  abrirCadastro(): void {
    this.animalEditando.set(undefined);
    this.nome.set('');
    this.erro.set('');
    this.mensagem.set('');
    this.modalAberto.set(true);
  }

  abrirEdicao(animal: Animal): void {
    this.animalEditando.set(animal);
    this.nome.set(animal.nome);
    this.erro.set('');
    this.mensagem.set('');
    this.modalAberto.set(true);
  }

  fecharModal(): void {
    if (this.salvando()) return;
    this.modalAberto.set(false);
  }

  async salvar(): Promise<void> {
    const userId = this.auth.getUserLogado();
    if (!userId || !this.nome().trim()) {
      this.erro.set('Informe o nome do animal.');
      return;
    }

    this.salvando.set(true);
    this.erro.set('');
    try {
      const animalEditando = this.animalEditando();
      if (animalEditando) {
        await this.animaisService.renomear(animalEditando.id, this.nome(), userId);
        this.mensagem.set('Animal atualizado.');
      } else {
        await this.animaisService.criar(this.nome(), userId);
        this.mensagem.set('Animal cadastrado.');
      }
      this.modalAberto.set(false);
    } catch (error) {
      this.erro.set(error instanceof Error ? error.message : 'Não foi possível salvar o animal.');
    } finally {
      this.salvando.set(false);
    }
  }

  async sair(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
