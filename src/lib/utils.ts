import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, parse, isValid as isValidDate, startOfDay } from 'date-fns';

/**
 * Combina classes CSS de forma inteligente, útil para aplicar classes condicionais em componentes Tailwind.
 * Utiliza `clsx` para lidar com objetos de classe e arrays, e `tailwind-merge` para resolver conflitos de classes Tailwind.
 * @param {...ClassValue} inputs - Uma lista de valores de classe a serem combinados. Pode incluir strings, arrays ou objetos.
 * @returns {string} Uma string contendo as classes CSS finais e mescladas.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Formata um valor numérico como uma string de moeda no padrão Real Brasileiro (BRL).
 * Inclui o símbolo "R$" e formatação de milhar e decimal apropriada para pt-BR.
 * @param {number | undefined | null} value - O valor numérico a ser formatado.
 * @returns {string} A string formatada como moeda (ex: "R$ 1.234,56") ou "R$ 0,00" se o valor for inválido, nulo ou undefined.
 */
export function formatCurrency(value: number | undefined | null): string {
    if (value === undefined || value === null || isNaN(value) || !isFinite(value)) {
        return 'R$ 0,00';
    }
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Mapeamento constante de IDs de loja para nomes legíveis por humanos.
 * Usado pela função `getStoreName` para fornecer uma representação textual dos IDs de loja.
 * @type {Record<string, string>}
 */
const LOJA_ID_TO_NAME_MAP: Record<string, string> = {
    'capao': 'Top Capão Bonito',
    'guapiara': 'Top Guapiara',
    'ribeirao': 'Top Ribeirão Branco',
    'admin': 'Caixa Simone', // Representa o caixa da administradora Simone ou operações administrativas
};

/**
 * Retorna o nome legível de uma loja com base no seu ID.
 * Se o ID não for encontrado no mapeamento `LOJA_ID_TO_NAME_MAP`, retorna o próprio ID como fallback.
 * Se o ID for nulo ou indefinido, retorna a string "Desconhecida".
 * @param {string | null | undefined} lojaId - O ID da loja (ex: 'capao', 'guapiara').
 * @returns {string} O nome formatado da loja ou um valor de fallback.
 */
export function getStoreName(lojaId: string | null | undefined): string {
    if (!lojaId) {
        return 'Desconhecida';
    }
    return LOJA_ID_TO_NAME_MAP[lojaId] || lojaId;
}

/**
 * Converte uma string de data no formato "DD/MM/YYYY" para o formato ISO "YYYY-MM-DD".
 * A hora é definida para o início do dia (00:00:00) na timezone local para consistência.
 * Retorna `null` se a string de entrada for inválida ou não corresponder ao formato esperado.
 * Útil para padronizar datas antes de enviar para o backend ou para comparações.
 * @param {string} dateString - A data como string no formato "DD/MM/YYYY".
 * @returns {string | null} A data formatada como "YYYY-MM-DD" ou `null` em caso de erro de parse.
 */
export function parseDateStringToISO(dateString: string): string | null {
    // Validação básica do formato DD/MM/YYYY usando regex.
    if (!dateString || !/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) {
        return null;
    }
    try {
        // Converte a string para um objeto Date, normalizando para o início do dia (local).
        // `parse` de date-fns espera o formato da data como segundo argumento.
        const parsedDate = startOfDay(parse(dateString, 'dd/MM/yyyy', new Date()));
        // Verifica se a data resultante é válida e a formata para o padrão ISO (YYYY-MM-DD).
        return isValidDate(parsedDate) ? format(parsedDate, 'yyyy-MM-dd') : null;
    } catch (e) {
        // Retorna null em caso de qualquer erro durante o parse ou formatação.
        console.error("Erro ao fazer parse da data:", e);
        return null;
    }
}

/**
 * Formata o valor de um input de data para o formato "DD/MM/YYYY" conforme o usuário digita.
 * Remove todos os caracteres não numéricos e aplica a máscara "DD/MM/YYYY" progressivamente,
 * facilitando a entrada correta da data pelo usuário.
 * @param {string} value - O valor atual do input de data.
 * @returns {string} O valor formatado para exibição no input (ex: "12/03/202").
 */
export function formatDateInput(value: string): string {
    // Remove tudo que não for dígito.
    let v = value.replace(/\D/g, '');
    // Limita o tamanho máximo para evitar strings excessivamente longas (DDMMYYYY = 8 dígitos).
    if (v.length > 8) v = v.slice(0, 8);

    // Aplica a formatação DD/MM/YYYY conforme o usuário digita.
    if (v.length > 4) { // Se tem mais de 4 dígitos (ex: DDMMY...)
        return `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`;
    } else if (v.length > 2) { // Se tem mais de 2 dígitos (ex: DDM...)
        return `${v.slice(0, 2)}/${v.slice(2)}`;
    }
    // Se tem 2 ou menos dígitos, retorna como está (ex: DD).
    return v;
}

/**
 * Converte um valor de input monetário (string ou número) para um número (float).
 * Esta função é projetada para tratar entradas comuns em campos de moeda,
 * como "1.234,56" (padrão brasileiro) ou "1234.56" (padrão americano com ponto decimal).
 * Remove caracteres não numéricos, exceto vírgula e ponto.
 * Padroniza o separador decimal para ponto antes de converter para float.
 * @param {string | number | undefined | null} value - O valor do input a ser convertido.
 * @returns {number} O valor convertido para número. Retorna 0 se a entrada for inválida, nula ou indefinida.
 */
export function parseCurrencyInput(value: string | number | undefined | null): number {
    if (typeof value === 'number') {
        return isNaN(value) || !isFinite(value) ? 0 : value;
    }
    if (value === '' || value === null || value === undefined) {
        return 0;
    }

    // Converte para string e remove caracteres não numéricos, exceto vírgula e ponto.
    const cleanedValue = String(value).replace(/[^\d,.]/g, '');

    // Padroniza para usar ponto como separador decimal.
    // Primeiro, substitui a última vírgula (se houver) por um ponto.
    // Depois, remove todos os outros pontos (que seriam separadores de milhar).
    let standardizedValue = cleanedValue;
    const lastCommaIndex = standardizedValue.lastIndexOf(',');
    if (lastCommaIndex !== -1) {
        const beforeComma = standardizedValue.substring(0, lastCommaIndex).replace(/\./g, ''); // Remove pontos antes da vírgula
        const afterComma = standardizedValue.substring(lastCommaIndex + 1);
        standardizedValue = `${beforeComma}.${afterComma}`;
    }
    // Remove pontos restantes que não sejam o separador decimal agora padronizado
    const parts = standardizedValue.split('.');
    if (parts.length > 2) {
        standardizedValue = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1];
    } else if (parts.length === 2 && parts[0] === '' && parts[1] !== '') { // Caso como ".50"
        standardizedValue = `0.${parts[1]}`;
    } else if (parts.length === 1 && parts[0] === '') { // Caso de string vazia ou apenas "."
        return 0;
    }

    const parsed = parseFloat(standardizedValue);
    return isNaN(parsed) || !isFinite(parsed) ? 0 : parsed;
}

/**
 * Formata um valor numérico ou uma string numérica para ser exibido em um input de moeda (sem o símbolo R$).
 * Ideal para controlar o valor de inputs `<input type="text">` que simulam entrada de moeda,
 * permitindo que o usuário digite valores com vírgula como separador decimal.
 * - Se for número, formata para string com duas casas decimais e vírgula como separador decimal.
 * - Se for string, remove caracteres não numéricos (exceto a primeira vírgula) e limita a duas casas decimais.
 * @param {string | number | undefined | null} value - O valor a ser formatado para o input.
 * @returns {string} A string formatada para uso no input (ex: "1234,56"). Retorna string vazia para undefined/null.
 */
export function formatCurrencyInputValue(value: string | number | undefined | null): string {
     if (value === undefined || value === null) return '';

     if (typeof value === 'number') {
        // Formata o número para string com 2 casas decimais, usando vírgula como separador decimal.
        return value.toFixed(2).replace('.', ',');
     }

     // Se for string, permite apenas números e uma vírgula.
     // Remove caracteres não numéricos, exceto a vírgula.
     let sValue = String(value).replace(/[^0-9,]/g, '');
     const commaIndex = sValue.indexOf(',');

     if (commaIndex !== -1) { // Se já tem vírgula
         // Garante que só existe uma vírgula, mantendo a primeira encontrada.
         sValue = sValue.substring(0, commaIndex + 1) + sValue.substring(commaIndex + 1).replace(/,/g, '');
         // Limita a duas casas decimais após a vírgula.
         if (sValue.substring(commaIndex + 1).length > 2) {
            sValue = sValue.substring(0, commaIndex + 3);
         }
     }
     return sValue;
}
