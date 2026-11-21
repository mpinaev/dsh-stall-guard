/**
 * command-guard — отклоняет команды агента, которые вставляют себе срок
 * (`timeout N`) или ждут циклом (`sleep`).
 *
 * Зачем: короткий `timeout` рвёт операцию на середине — остановка docker
 * бросается на полпути, следом идёт удаление файлов живого движка, и никто
 * не замечает, что предыдущий шаг не состоялся. А `sleep` в цикле тратит
 * время впустую вместо проверки результата.
 *
 * Гейт нужен потому, что правило в AGENTS.md модель выполняет не всегда:
 * отказ виден в том же шаге, где команда, и модель сразу переписывает вызов.
 */

/** Имя Cordis-плагина. */
export const name = 'command-guard'

/** Проверка стоит на конвейере инструментов. */
export const inject = ['tools']

/**
 * `timeout 25`, `timeout -k 5 25`, в том числе внутри кавычек у `ssh host '...'`.
 * Строчное написание — намеренно: `ConnectTimeout=5` и `TimeoutStopSec=` не
 * ловятся, потому что там другая буква и нет пробела перед числом.
 */
const TIMEOUT_WRAPPER = /(?:^|[\s;&|('"[\]])(?:timeout)\s+(?:-[A-Za-z]+\s+)*\d/

/** `sleep 1`, `sleep 0.5`, в том числе в середине строки после `;` или `&&`. */
const SLEEP = /(?:^|[\s;&|('"[\]])(?:sleep)\s+\d/

const TIMEOUT_REASON =
  'Команда отклонена: в ней есть `timeout N`. Произвольный срок обрывает операцию на ' +
  'середине и оставляет систему в неизвестном состоянии, а код возврата при этом теряется. ' +
  'Убери `timeout`: systemctl и docker сами ждут завершения. Если команда действительно может ' +
  'зависнуть, запусти её в фоне (`run_in_background: true`) и забери вывод через `job_output`.'

const SLEEP_REASON =
  'Команда отклонена: в ней есть `sleep`. Ожидание циклом запрещено. Запусти работу в фоне ' +
  '(`run_in_background: true`) и проверь результат через `job_output`, либо используй ' +
  'блокирующую команду вместо цикла со сном.'

/** Короткий опрос фоновой задачи: до 15 секунд — это проверка, а не ожидание. */
const QUICK_WAIT_MS = 15000

const JOB_WAIT_REASON =
  'Ожидание отклонено: `job_output` с `wait: true` дольше 15 секунд — это те же десять минут, ' +
  'только по частям. О завершении фоновой задачи DSH сообщает сам; вызови `job_output` без ' +
  'ожидания (`wait: false`), займись другой работой, и результат придёт следующим ходом. ' +
  'Быстрая проверка допустима: `wait: true` с `timeout_ms` не больше 15000.'

/**
 * Проверяет текст команды и возвращает причину отказа.
 * @param {string} command командная строка из аргументов инструмента
 * @returns {string|undefined} причина отказа или undefined, когда команда чистая
 */
export function inspectCommand(command) {
  if (TIMEOUT_WRAPPER.test(command)) return TIMEOUT_REASON
  if (SLEEP.test(command)) return SLEEP_REASON
}

/**
 * Проверяет аргументы чтения фоновой задачи: блокирующее ожидание — тот же
 * сон, только через инструмент.
 * @param {Record<string, unknown>} args аргументы вызова `job_output`
 * @returns {string|undefined} причина отказа или undefined, когда вызов короткий
 */
export function inspectJobOutput(args) {
  if (args.wait !== true) return
  const timeout = typeof args.timeout_ms === 'number' ? args.timeout_ms : QUICK_WAIT_MS
  if (timeout > QUICK_WAIT_MS) return JOB_WAIT_REASON
}

const WAIT_AGENT_REASON =
  'Ожидание отклонено: `wait_agent` дольше 15 секунд. Уведомление о завершении работы ' +
  'приходит само, отдельным ходом; сидеть в ожидании незачем. Вернись к своему шагу, а ' +
  'если ждать действительно нечего — так и скажи вместо простоя.'

/**
 * Проверяет аргументы ожидания ответа другого агента.
 * @param {Record<string, unknown>} args аргументы вызова `wait_agent`
 * @returns {string|undefined} причина отказа или undefined, когда ожидание короткое
 */
export function inspectWaitAgent(args) {
  const timeout = typeof args.timeout_ms === 'number' ? args.timeout_ms : QUICK_WAIT_MS
  if (timeout > QUICK_WAIT_MS) return WAIT_AGENT_REASON
}

/**
 * Регистрирует монотонный гейт: отказ нельзя отменить другим слушателем.
 * @param {import('@deepseek-ai/cordis').Context} ctx контекст плагина
 */
export function apply(ctx) {
  ctx.tools.guard((exec) => {
    const args = exec.arguments
    if (!args || typeof args !== 'object') return
    if (exec.name === 'bash' || exec.name === 'pwsh') {
      const command = args.command
      if (typeof command !== 'string') return
      return inspectCommand(command)
    }
    if (exec.name === 'job_output') return inspectJobOutput(args)
    if (exec.name === 'wait_agent') return inspectWaitAgent(args)
  })
}
