const menuButton = document.getElementById('menuButton')
const mobileMenu = document.getElementById('mobileMenu')
menuButton?.addEventListener('click', () => {
  const isOpen = !mobileMenu.classList.contains('hidden')
  mobileMenu.classList.toggle('hidden', isOpen)
  menuButton.setAttribute('aria-expanded', String(!isOpen))
})

mobileMenu?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    mobileMenu.classList.add('hidden')
    menuButton?.setAttribute('aria-expanded', 'false')
  })
})

document.querySelectorAll('.copy-path').forEach((button) => {
  button.addEventListener('click', async () => {
    const path = button.getAttribute('data-path') || button.textContent || ''
    try {
      await navigator.clipboard.writeText(path)
      const original = button.textContent
      button.textContent = 'copied'
      setTimeout(() => { button.textContent = original }, 900)
    } catch {
      window.prompt('Copy path', path)
    }
  })
})

const asyncButton = document.getElementById('asyncButton')
const effectButton = document.getElementById('effectButton')
const asyncExamples = document.getElementById('asyncExamples')
const effectExamples = document.getElementById('effectExamples')

function setExampleMode(mode) {
  if (!asyncButton || !effectButton || !asyncExamples || !effectExamples) return
  const effectMode = mode === 'effect'
  asyncExamples.classList.toggle('hidden', effectMode)
  effectExamples.classList.toggle('hidden', !effectMode)
  asyncButton.setAttribute('aria-pressed', String(!effectMode))
  effectButton.setAttribute('aria-pressed', String(effectMode))
  asyncButton.classList.toggle('bg-zinc-950', !effectMode)
  asyncButton.classList.toggle('text-white', !effectMode)
  asyncButton.classList.toggle('bg-white', effectMode)
  asyncButton.classList.toggle('text-zinc-700', effectMode)
  effectButton.classList.toggle('bg-zinc-950', effectMode)
  effectButton.classList.toggle('text-white', effectMode)
  effectButton.classList.toggle('bg-white', !effectMode)
  effectButton.classList.toggle('text-zinc-700', !effectMode)
}

asyncButton?.addEventListener('click', () => setExampleMode('async'))
effectButton?.addEventListener('click', () => setExampleMode('effect'))
setExampleMode('async')
