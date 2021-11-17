#!/usr/bin/env python2

import requests
import time
import sys
import signal
import argparse
import logging


LOG = logging.getLogger('trusted_proxy_testing')
LOG.setLevel(logging.DEBUG)
FORMATTER = logging.Formatter(
    '%(asctime)s - %(name)s - %(levelname)s - %(message)s')
LOGSTREAM = logging.StreamHandler(sys.stdout)
LOGSTREAM.setFormatter(FORMATTER)
LOG.addHandler(LOGSTREAM)


def handler(signum, frame):
    LOG.info('user requested exit..')
    sys.exit(0)


def print_local_id():
    device_response = requests.get(
        'http://127.0.0.1:8100/mgmt/shared/identified-devices/config/device-info',
        auth=requests.auth.HTTPBasicAuth('admin', ''))
    device_response.raise_for_status()
    local_device_info = device_response.json()
    cert_response = requests.get(
        'http://127.0.0.1:8100/mgmt/shared/device-certificates',
        auth=requests.auth.HTTPBasicAuth('admin', ''))
    cert_response.raise_for_status()
    cert_json = cert_response.json()
    local_certs = []
    if 'items' in cert_json:
        local_certs = cert_json['items']
    if not local_certs:
        raise Exception(
            'no local certificates found.. local iControl REST error')
    local_cert_id = ''
    for c in local_certs:
        if c['machineId'] == local_device_info['machineId']:
            local_cert_id = c['certificateId']
    LOG.info("########### LOCAL DEVICE ###########")
    LOG.info("%s version %s",
             local_device_info['platformMarketingName'], local_device_info['restFrameworkVersion'])
    LOG.info("hostname: %s", local_device_info['hostname'])
    LOG.info("id: %s", local_device_info['machineId'])
    LOG.info("certificate id:%s", local_cert_id)
    LOG.info("####################################")
    return local_cert_id


def print_local_proxy_trusts():
    proxy_response = requests.get(
        'http://127.0.0.1:8105/shared/TrustedProxy')
    proxy_response.raise_for_status()
    proxy_trusts = proxy_response.json()
    LOG.info("######## LOCAL PROXY TRUSTS ########")
    for d in proxy_trusts:
        sec_left = int(600 - (int(time.time()) - d['timestamp'] / 1000))
        LOG.info('have a trust token for: %s:%d for another %d seconds' %
                 (d['targetHost'], d['targetPort'], sec_left))
    LOG.info("####################################")
    return proxy_trusts


def get_remote_device_info(targetHost, targetPort):
    data = {
        'method': 'Get',
        'uri': 'https://%s:%d/mgmt/shared/identified-devices/config/device-info' % (targetHost, targetPort)
    }
    response = requests.post(
        'http://127.0.0.1:8105/shared/TrustedProxy', json=data)
    response.raise_for_status()
    return response.json()


def get_remote_device_certificates(targetHost, targetPort):
    data = {
        'method': 'Get',
        'uri': 'https://%s:%d/mgmt/shared/device-certificates' % (targetHost, targetPort)
    }
    response = requests.post(
        'http://127.0.0.1:8105/shared/TrustedProxy', json=data)
    response.raise_for_status()
    response_json = response.json()
    if 'items' in response_json:
        return response_json['items']
    else:
        return []


def do_you_trust_me():
    my_cert_id = print_local_id()
    devices = print_local_proxy_trusts()
    LOG.info("########## TESTING TRUSTS ##########")
    for d in devices:
        remote_device_info = get_remote_device_info(
            d['targetHost'], d['targetPort'])
        remote_certs = get_remote_device_certificates(
            d['targetHost'], d['targetPort'])
        trusted = False
        remote_certificate_id = ''
        for c in remote_certs:
            if c['certificateId'] == my_cert_id:
                trusted = True
            if c['machineId'] == remote_device_info['machineId']:
                remote_certificate_id = c['certificateId']
        remote_print = "%s at %s:%d (%s [%s] machineId: %s certificateId: %s)" % (
            remote_device_info['hostname'],
            d['targetHost'],
            d['targetPort'],
            remote_device_info['platformMarketingName'],
            remote_device_info['restFrameworkVersion'],
            remote_device_info['machineId'],
            remote_certificate_id
        )
        if trusted:
            LOG.info("%s trusts me" % remote_print)
    LOG.info("####################################")


def test_cycle(delay):
    try:
        do_you_trust_me()
    except Exception as ex:
        LOG.error("test cycle failed with %s" % ex)
    time.sleep(delay)


def main():
    ap = argparse.ArgumentParser(
        prog='test_local_trusts',
        usage='%(prog)s.py [options]',
        description='poll remote devices assuring trusts are established'
    )
    ap.add_argument(
        '--cycles',
        help="The number of cycles through local trusts to test",
        required=False,
        type=int,
        default=0
    )
    ap.add_argument(
        '--delay',
        help="The delay in seconds between cycles",
        required=False,
        type=int,
        default=10
    )
    args = ap.parse_args()
    signal.signal(signal.SIGINT, handler)
    if args.cycles == 0:
        while True:
            test_cycle(args.delay)
    else:
        for _ in range(args.cycles):
            test_cycle(args.delay)


if __name__ == '__main__':
    main()
