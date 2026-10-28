import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface ItemBarra {
  rotulo: string;
  valor: number;
  detalhe?: string;
}

@Component({
  selector: 'app-grafico-barras',
  standalone: true,
  templateUrl: './grafico-barras.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GraficoBarras {
  readonly titulo = input.required<string>();
  readonly itens = input.required<ItemBarra[]>();
  readonly formatarValor = input<(valor: number) => string>((valor) => String(valor));

  readonly linhas = computed(() => {
    const itens = this.itens();
    const formatar = this.formatarValor();
    const maximo = Math.max(0, ...itens.map((item) => item.valor));

    return itens.map((item) => ({
      rotulo: item.rotulo,
      detalhe: item.detalhe ?? '',
      texto: formatar(item.valor),
      largura: maximo > 0 && item.valor > 0 ? Math.max(2, (item.valor / maximo) * 100) : 0,
    }));
  });
}