import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import QRCode from 'qrcode';
import { Auth } from '../../core/auth/auth';
import { Caixa, CaixasService } from '../../core/data/caixas';
import { Animal, AnimaisService } from '../../core/data/animais';
import { AppNavigation } from '../../shared/navigation/app-navigation';

type FiltroStatus = 'Todas' | 'Ativas' | 'Livres';

interface QrCaixa {
  caixa: Caixa;
  imagem?: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppNavigation],
  templateUrl: './dashboard.html',
})
export class Dashboard implements OnDestroy {
  @ViewChild('scannerVideo') scannerVideo?: ElementRef<HTMLVideoElement>;

  private readonly auth = inject(Auth);
  private readonly caixasService = inject(CaixasService);
  private readonly animaisService = inject(AnimaisService);
  private readonly router = inject(Router);
  private scannerControls?: IScannerControls;

  readonly caixas = this.caixasService.caixas;
  readonly animais = this.animaisService.animais;
  readonly ciclosVencidos = this.caixasService.ciclosVencidos;
  readonly busca = signal('');
  readonly filtroStatus = signal<FiltroStatus>('Todas');
  readonly filtroAnimal = signal<number | null>(null);
  readonly formularioCaixaAberto = signal(false);
  readonly qrSelecionado = signal<QrCaixa | undefined>(undefined);
  readonly gerandoQr = signal(false);
  readonly caixasFiltradas = computed(() => {
    const termo = this.busca().trim().toLocaleLowerCase('pt-BR');
    const filtro = this.filtroStatus();

    return this.caixas().filter((caixa) => {
      const nomeAnimal = this.animalNome(caixa.animal_id).toLocaleLowerCase('pt-BR');
      const correspondeBusca = !termo
        || `caixa ${caixa.numero}`.includes(termo)
        || nomeAnimal.includes(termo);
      const correspondeStatus = filtro === 'Todas'
        || (filtro === 'Ativas' ? caixa.status : !caixa.status);
      const animalId = this.filtroAnimal();
      const correspondeAnimal = animalId === null || caixa.animal_id === animalId;
      return correspondeBusca && correspondeStatus && correspondeAnimal;
    });
  });
  readonly totalAtivas = computed(() => this.caixas().filter((caixa) => caixa.status).length);
  readonly totalLivres = computed(() => this.caixas().filter((caixa) => !caixa.status).length);
  readonly resumoPorAnimal = computed(() =>
    this.animais().map((animal) => {
      const caixasDoAnimal = this.caixas().filter((caixa) => caixa.animal_id === animal.id);
      return {
        id: animal.id,
        nome: animal.nome,
        total: caixasDoAnimal.length,
        emCiclo: caixasDoAnimal.filter((caixa) => caixa.status).length,
      };
    }).filter((item) => item.total > 0),
  );
  numeroNovaCaixa: number | null = null;
  readonly animalIdNovo = signal<number | null>(null);
  readonly carregando = signal(true);
  readonly salvando = signal(false);
  readonly scannerAberto = signal(false);
  readonly erro = signal('');

  constructor() {
    void this.carregarCaixas();
  }

  async carregarCaixas(): Promise<void> {
    const userId = this.auth.getUserLogado();
    if (!userId) {
      await this.auth.restaurarSessao();
    }

    const currentUserId = this.auth.getUserLogado();
    if (!currentUserId) {
      this.carregando.set(false);
      this.erro.set('Sua sessão expirou. Entre novamente para acessar as caixas.');
      return;
    }

    this.carregando.set(true);
    this.erro.set('');

    try {
      await Promise.all([
        this.caixasService.listar(currentUserId),
        this.animaisService.listar(currentUserId),
      ]);
    } catch (error) {
      this.erro.set(error instanceof Error ? error.message : 'Não foi possível carregar as caixas.');
    } finally {
      this.carregando.set(false);
    }
  }

  async criarCaixa(): Promise<void> {
    const userId = this.auth.getUserLogado();
    const animalId = this.animalIdNovo();
    if (!userId || !Number.isInteger(this.numeroNovaCaixa) || !this.numeroNovaCaixa || this.numeroNovaCaixa < 1 || animalId === null) {
      this.erro.set(animalId === null ? 'Selecione um animal para a caixa.' : 'Informe um número de caixa válido.');
      return;
    }

    this.salvando.set(true);
    this.erro.set('');

    try {
      await this.caixasService.criar(this.numeroNovaCaixa, userId, animalId);
      this.numeroNovaCaixa = null;
      this.formularioCaixaAberto.set(false);
      await this.carregarCaixas();
    } catch (error) {
      this.erro.set(error instanceof Error ? error.message : 'Não foi possível cadastrar a caixa.');
    } finally {
      this.salvando.set(false);
    }
  }

  definirFiltroStatus(filtro: FiltroStatus): void {
    this.filtroStatus.set(filtro);
  }

  abrirCadastroCaixa(): void {
    this.erro.set('');
    this.animalIdNovo.set(this.animais()[0]?.id ?? null);
    this.formularioCaixaAberto.set(true);
  }

  animalNome(animalId: number | null): string {
    return this.animais().find((animal) => animal.id === animalId)?.nome ?? 'Animal não vinculado';
  }

  identificarAnimal(_index: number, animal: Pick<Animal, 'id'>): number {
    return animal.id;
  }

  async abrirQr(caixa: Caixa): Promise<void> {
    this.qrSelecionado.set({ caixa });
    this.gerandoQr.set(true);

    try {
      const url = new URL(`/caixa/${caixa.id}`, window.location.origin).toString();
      const imagem = await QRCode.toDataURL(url, {
        width: 360,
        margin: 2,
        errorCorrectionLevel: 'H',
      });
      this.qrSelecionado.set({ caixa, imagem });
    } catch (error) {
      this.erro.set(error instanceof Error ? error.message : 'Não foi possível gerar o QR Code.');
      this.fecharQr();
    } finally {
      this.gerandoQr.set(false);
    }
  }

  fecharQr(): void {
    this.qrSelecionado.set(undefined);
    this.gerandoQr.set(false);
  }

  async abrirLeitor(): Promise<void> {
    this.erro.set('');
    this.scannerAberto.set(true);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    if (!this.scannerVideo?.nativeElement) {
      this.erro.set('Não foi possível iniciar a câmera neste dispositivo.');
      this.scannerAberto.set(false);
      return;
    }

    try {
      const reader = new BrowserMultiFormatReader();
      this.scannerControls = await reader.decodeFromVideoDevice(
        undefined,
        this.scannerVideo.nativeElement,
        (result) => {
          if (result) {
            const scannedUrl = result.getText();
            this.fecharLeitor();
            void this.abrirCaixaDoQr(scannedUrl);
          }
        },
      );
    } catch {
      this.erro.set('Permita o acesso à câmera e tente novamente. A leitura exige HTTPS ou localhost.');
      this.fecharLeitor();
    }
  }

  fecharLeitor(): void {
    this.scannerControls?.stop();
    this.scannerControls = undefined;
    this.scannerAberto.set(false);
  }

  async abrirCaixaDoQr(value: string): Promise<void> {
    try {
      const conteudo = value.trim();
      const url = new URL(conteudo, window.location.origin);
      const rotaCaixa = url.pathname.match(/^\/caixa\/(\d+)\/?$/);

      if (
        !['http:', 'https:'].includes(url.protocol)
        || url.username
        || url.password
        || !rotaCaixa
      ) {
        this.erro.set('Este QR Code não pertence a uma caixa do RatControl.');
        return;
      }

      await this.router.navigateByUrl(`/caixa/${rotaCaixa[1]}`);
    } catch {
      this.erro.set('O QR Code não contém um endereço válido.');
    }
  }

  async sair(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }

  ngOnDestroy(): void {
    this.fecharLeitor();
  }
}