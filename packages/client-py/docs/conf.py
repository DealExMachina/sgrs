# Sphinx configuration for sgrs-client API reference.

from __future__ import annotations

import sys
from pathlib import Path

_docs_dir = Path(__file__).resolve().parent
_pkg_root = _docs_dir.parent
_src = _pkg_root / "src"
sys.path.insert(0, str(_src.resolve()))

project = "sgrs-client"
copyright = "Deal ex Machina SAS"
author = "Deal ex Machina SAS"
release = "0.1.0"
version = "0.1.0"

extensions = [
    "sphinx.ext.autodoc",
    "sphinx.ext.napoleon",
    "sphinx.ext.viewcode",
    "sphinx.ext.intersphinx",
    "myst_parser",
]

source_suffix = {
    ".rst": "restructuredtext",
    ".md": "markdown",
}

exclude_patterns = ["_build", "Thumbs.db", ".DS_Store"]

html_theme = "sphinx_rtd_theme"
html_static_path = ["_static"]

html_theme_options = {
    "collapse_navigation": False,
}

intersphinx_mapping = {
    "python": ("https://docs.python.org/3", None),
}

autoclass_content = "class"
autodoc_member_order = "bysource"
autodoc_default_options = {
    "members": True,
    "undoc-members": True,
    "show-inheritance": True,
}
