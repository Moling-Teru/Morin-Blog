# Publishing Notes

## GitHub

The local repository is ready at:

`/Users/hsad/Documents/CodeProject/hexo-theme-hsad`

Configured remote:

`https://github.com/watanabe-hsad/hexo-theme-hsad.git`

Once the GitHub repository exists, push with:

```bash
git -C /Users/hsad/Documents/CodeProject/hexo-theme-hsad push -u origin main
```

## Hexo Official Theme List

Hexo's official site currently expects:

1. A public GitHub repository for the theme
2. A theme data file under `source/_data/themes/<theme-name>.yml`
3. A screenshot under `source/themes/screenshots/<theme-name>.png`

Prepared files in this repo:

- `hexo-theme-hsad.yml`
- `hexo-theme-hsad.png`

The usual submission flow is:

1. Push this theme repo to GitHub
2. Fork `hexojs/site`
3. Copy `hexo-theme-hsad.yml` to `source/_data/themes/hexo-theme-hsad.yml`
4. Copy `hexo-theme-hsad.png` to `source/themes/screenshots/hexo-theme-hsad.png`
5. Open a pull request to `hexojs/site`
