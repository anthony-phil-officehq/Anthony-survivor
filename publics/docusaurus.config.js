// @ts-check

const config = {
  title: 'OfficeHQ Study Cases',
  tagline: 'Kho study case của dự án OfficeHQ',
  favicon: 'img/favicon.svg',
  url: 'https://anthony-phil-officehq.github.io',
  baseUrl: '/Anthony-survivor/',
  organizationName: 'anthony-phil-officehq',
  projectName: 'Anthony-survivor',
  trailingSlash: false,
  onBrokenLinks: 'throw',
  i18n: {
    defaultLocale: 'vi',
    locales: ['vi'],
  },
  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: require.resolve('./sidebars.js'),
        },
        blog: false,
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      },
    ],
  ],
  themeConfig: {
    navbar: {
      title: 'OfficeHQ Study Cases',
      items: [
        {href: 'https://github.com/anthony-phil-officehq/Anthony-survivor', label: 'GitHub', position: 'right'},
      ],
    },
    footer: {
      style: 'dark',
      copyright: `OfficeHQ ${new Date().getFullYear()}`,
    },
  },
};

module.exports = config;
