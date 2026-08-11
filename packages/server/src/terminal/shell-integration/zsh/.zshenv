typeset -g YEMU_SHELL_INTEGRATION_DIR="${${(%):-%N}:A:h}"

if [[ -n "${YEMU_ZSH_ZDOTDIR-}" ]]; then
  export ZDOTDIR="${YEMU_ZSH_ZDOTDIR}"
else
  unset ZDOTDIR
fi

if [[ -n "${ZDOTDIR-}" ]]; then
  if [[ -f "${ZDOTDIR}/.zshenv" ]]; then
    source "${ZDOTDIR}/.zshenv"
  fi
elif [[ -f "${HOME}/.zshenv" ]]; then
  source "${HOME}/.zshenv"
fi

source "${YEMU_SHELL_INTEGRATION_DIR}/yemu-integration.zsh"
