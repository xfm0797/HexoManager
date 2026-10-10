/** 404 页面：路由未匹配时的兜底展示 */

import { Button, Result, Space } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  AppstoreOutlined,
  CloudServerOutlined,
  HomeOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { useI18n } from '@/i18n';

/** 404 未找到页面 */
export function NotFoundPage() {
  const navigate = useNavigate();
  const { t } = useI18n();

  return (
    <div className="flex h-full items-center justify-center">
      <Result
        status="404"
        title="404"
        subTitle={t('抱歉，你访问的页面不存在或已被移除。')}
        extra={
          <Space direction="vertical" size={12} className="items-center">
            <Space wrap>
              <Button type="primary" icon={<HomeOutlined />} onClick={() => navigate('/')}>
                {t('返回工作台')}
              </Button>
              <Button icon={<CloudServerOutlined />} onClick={() => navigate('/sites')}>
                {t('站点管理')}
              </Button>
            </Space>

            <div className="mt-2 text-xs hm-text-secondary">{t('常用入口')}</div>
            <Space wrap size={6}>
              <Button
                size="small"
                type="link"
                icon={<AppstoreOutlined />}
                onClick={() => navigate('/articles')}
              >
                {t('文章管理')}
              </Button>
              <Button
                size="small"
                type="link"
                icon={<RocketOutlined />}
                onClick={() => navigate('/deploy')}
              >
                {t('部署配置')}
              </Button>
            </Space>
          </Space>
        }
      />
    </div>
  );
}

export default NotFoundPage;
